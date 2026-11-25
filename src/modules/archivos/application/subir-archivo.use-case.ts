import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { FILE_STORAGE, FileStorage } from '../../../shared/domain/file-storage.port';
import {
  CategoriaArchivo,
  descripcionPermitidos,
  detectarExtension,
  extensionPermitida,
} from '../domain/tipo-archivo';

/**
 * Guarda una imagen (de publicación) o un documento (de verificación).
 * Las imágenes devuelven una URL pública; los documentos solo una ruta privada.
 */
@Injectable()
export class SubirArchivoUseCase {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  async execute(input: {
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
    return { ruta, url: this.storage.urlPublica(ruta) };
  }
}
