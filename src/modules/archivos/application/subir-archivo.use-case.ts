import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { FILE_STORAGE, FileStorage } from '../../../shared/domain/file-storage.port';
import { ARCHIVO_REPOSITORY, ArchivoRepository } from '../domain/archivo.repository';
import {
  CategoriaArchivo,
  descripcionPermitidos,
  detectarExtension,
  extensionPermitida,
} from '../domain/tipo-archivo';

/**
 * Guarda una imagen (de publicación) o un documento (de verificación).
 * Las imágenes devuelven una URL pública; los documentos solo una ruta privada.
 * Cada archivo queda registrado con su dueño: solo él podrá adjuntarlo.
 */
@Injectable()
export class SubirArchivoUseCase {
  private readonly logger = new Logger(SubirArchivoUseCase.name);

  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(ARCHIVO_REPOSITORY) private readonly archivos: ArchivoRepository,
  ) {}

  async execute(input: {
    idUsuario: number;
    contenido: Buffer | undefined;
    categoria: CategoriaArchivo;
  }): Promise<{ ruta: string; url: string | null }> {
    if (!input.contenido || input.contenido.length === 0) {
      throw new BusinessRuleError('Envía el archivo en el campo "archivo"');
    }

    const extension = detectarExtension(input.contenido);
    if (!extension || !extensionPermitida(input.categoria, extension)) {
      throw new BusinessRuleError(
        `Formato no permitido. Formatos aceptados: ${descripcionPermitidos(input.categoria)}`,
      );
    }

    const carpeta = input.categoria === 'IMAGEN' ? 'imagenes' : 'documentos';
    const ruta = await this.storage.guardar(input.contenido, carpeta, extension);
    try {
      await this.archivos.registrar({ ruta, idUsuario: input.idUsuario, categoria: input.categoria });
    } catch (error) {
      // Compensación: sin registro el archivo quedaría huérfano. Si también falla, lo recoge archivos:limpiar.
      await this.storage.eliminar(ruta).catch((e) => this.logger.warn(`No se pudo borrar ${ruta}: ${String(e)}`));
      throw error;
    }
    return { ruta, url: this.storage.urlPublica(ruta) };
  }
}
