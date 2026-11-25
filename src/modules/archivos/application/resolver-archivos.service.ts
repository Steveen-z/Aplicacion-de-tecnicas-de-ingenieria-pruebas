import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';
import { FILE_STORAGE, FileStorage } from '../../../shared/domain/file-storage.port';
import { ARCHIVO_REPOSITORY, ArchivoRepository } from '../domain/archivo.repository';
import { ProblemaArchivo, clasificarReferencias } from '../domain/propiedad-archivos';
import { CategoriaArchivo } from '../domain/tipo-archivo';

function lanzar(problema: ProblemaArchivo, categoria: CategoriaArchivo): never {
  const que = categoria === 'IMAGEN' ? 'La imagen' : 'El documento';
  const endpoint = categoria === 'IMAGEN' ? 'POST /archivos/imagenes' : 'POST /archivos/documentos';
  switch (problema.tipo) {
    case 'AJENO':
      throw new ForbiddenError(`${que} pertenece a otro usuario`, { valor: problema.valor });
    case 'CATEGORIA_INCORRECTA':
      throw new BusinessRuleError(`${que} no es del tipo correcto`, { valor: problema.valor });
    default:
      throw new BusinessRuleError(`${que} no fue subida a la plataforma. Súbela primero con ${endpoint}`, {
        valor: problema.valor,
      });
  }
}

/**
 * Confirma que las fotos y documentos que se adjuntan son archivos subidos a la plataforma
 * por el mismo usuario (antes se aceptaba cualquier URL o la ruta de otro usuario).
 */
@Injectable()
export class ResolverArchivosService {
  constructor(
    @Inject(ARCHIVO_REPOSITORY) private readonly repo: ArchivoRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Devuelve, por cada URL, la ruta (clave del objeto) a guardar en la fotografía. */
  async resolverImagenes(idUsuario: number, urls: string[]): Promise<{ urlImagen: string; ruta: string }[]> {
    const pedidas = urls.map((valor) => ({ valor, ruta: this.storage.rutaDesdeUrl(valor) }));
    const rutas = [...new Set(pedidas.flatMap((p) => (p.ruta ? [p.ruta] : [])))];
    const problema = clasificarReferencias(idUsuario, 'IMAGEN', pedidas, await this.repo.buscarPorRutas(rutas));
    if (problema) lanzar(problema, 'IMAGEN');
    return pedidas.map((p) => ({ urlImagen: p.valor, ruta: p.ruta! }));
  }

  async verificarDocumento(idUsuario: number, ruta: string): Promise<void> {
    const problema = clasificarReferencias(idUsuario, 'DOCUMENTO', [{ valor: ruta, ruta }], await this.repo.buscarPorRutas([ruta]));
    if (problema) lanzar(problema, 'DOCUMENTO');
  }
}
