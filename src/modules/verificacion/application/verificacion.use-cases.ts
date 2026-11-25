import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { FILE_STORAGE, FileStorage, esRutaArchivoValida } from '../../../shared/domain/file-storage.port';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import {
  DocumentoConVendedor,
  DocumentoVerificacion,
  EstadoRevision,
  EstadoVerificacion,
  calcularEstadoVerificacion,
  estadoTrasEnvio,
} from '../domain/documento';
import { DOCUMENTO_REPOSITORY, DocumentoRepository, ResultadoDocumento } from '../domain/documento.repository';

function exigirVendedor(user: AuthUser): number {
  if (user.idVendedor === null) throw new ForbiddenError('Necesitas una cuenta de vendedor');
  return user.idVendedor;
}

/** Documentos de identidad/propiedad que el vendedor envía para verificar su cuenta (UML: DocumentoVerificacion). */
@Injectable()
export class EnviarDocumentoUseCase {
  constructor(@Inject(DOCUMENTO_REPOSITORY) private readonly repo: DocumentoRepository) {}

  execute(input: { user: AuthUser; tipoDocumento: string; rutaDocumento: string }): Promise<ResultadoDocumento> {
    const idVendedor = exigirVendedor(input.user);
    // La ruta debe ser una devuelta por POST /archivos/documentos, no una ruta arbitraria.
    if (!esRutaArchivoValida(input.rutaDocumento, 'documentos')) {
      throw new BusinessRuleError('La ruta del documento no es válida. Súbelo primero con POST /archivos/documentos');
    }
    return this.repo.registrarDocumento(idVendedor, input.tipoDocumento, input.rutaDocumento, estadoTrasEnvio);
  }
}

@Injectable()
export class ListarMisDocumentosUseCase {
  constructor(@Inject(DOCUMENTO_REPOSITORY) private readonly repo: DocumentoRepository) {}

  async execute(user: AuthUser): Promise<{ estadoVerificacion: EstadoVerificacion; documentos: DocumentoVerificacion[] }> {
    const idVendedor = exigirVendedor(user);
    const [estadoVerificacion, documentos] = await Promise.all([
      this.repo.obtenerEstadoVendedor(idVendedor),
      this.repo.listarDeVendedor(idVendedor),
    ]);
    return { estadoVerificacion: estadoVerificacion ?? 'PENDIENTE', documentos };
  }
}

/** Administrador: cola de documentos por revisar. */
@Injectable()
export class ListarDocumentosAdminUseCase {
  constructor(@Inject(DOCUMENTO_REPOSITORY) private readonly repo: DocumentoRepository) {}

  async execute(input: {
    estado: EstadoRevision;
    page: number;
    limit: number;
  }): Promise<Pagina<DocumentoConVendedor>> {
    const { items, total } = await this.repo.listarPorEstado(input.estado, input);
    return crearPagina(items, total, input.page, input.limit);
  }
}

/** Administrador: aprueba o rechaza un documento (UML: Vendedor.verificarIdentidad / DocumentoVerificacion.validarDocumento). */
@Injectable()
export class RevisarDocumentoUseCase {
  constructor(@Inject(DOCUMENTO_REPOSITORY) private readonly repo: DocumentoRepository) {}

  async execute(input: {
    idDocumento: number;
    estado: 'APROBADO' | 'RECHAZADO';
    observaciones?: string;
  }): Promise<ResultadoDocumento> {
    const observaciones = input.observaciones?.trim() || null;
    if (input.estado === 'RECHAZADO' && !observaciones) {
      throw new BusinessRuleError('Indica el motivo del rechazo en las observaciones');
    }

    const actual = await this.repo.buscarPorId(input.idDocumento);
    if (!actual) throw new NotFoundError('El documento no existe');
    if (actual.estadoRevision !== 'PENDIENTE') {
      throw new ConflictError('Este documento ya fue revisado');
    }

    const resultado = await this.repo.revisarDocumento(
      input.idDocumento,
      { estado: input.estado, observaciones },
      calcularEstadoVerificacion,
    );
    if (!resultado) throw new NotFoundError('El documento no existe');
    return resultado;
  }
}

/** Administrador: lee el archivo del documento para revisarlo. */
@Injectable()
export class ObtenerArchivoDocumentoUseCase {
  constructor(
    @Inject(DOCUMENTO_REPOSITORY) private readonly repo: DocumentoRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(idDocumento: number): Promise<{ contenido: Buffer; ruta: string }> {
    const documento = await this.repo.buscarPorId(idDocumento);
    if (!documento) throw new NotFoundError('El documento no existe');
    return { contenido: await this.storage.leer(documento.rutaDocumento), ruta: documento.rutaDocumento };
  }
}
