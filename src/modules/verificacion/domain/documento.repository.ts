import {
  DocumentoConVendedor,
  DocumentoVerificacion,
  EstadoRevision,
  EstadoVerificacion,
  ResolverEstadoEnvio,
  ResolverEstadoRevision,
} from './documento';

export const DOCUMENTO_REPOSITORY = Symbol('DOCUMENTO_REPOSITORY');

export interface ResultadoDocumento {
  documento: DocumentoVerificacion;
  estadoVerificacion: EstadoVerificacion;
}

export interface DocumentoRepository {
  /** Guarda el documento (PENDIENTE) y recalcula vendedores.estado_verificacion en la misma transacción. */
  registrarDocumento(
    idVendedor: number,
    tipoDocumento: string,
    rutaDocumento: string,
    resolverEstado: ResolverEstadoEnvio,
  ): Promise<ResultadoDocumento>;
  /** null si el documento no existe. Recalcula el estado del vendedor en la misma transacción. */
  revisarDocumento(
    idDocumento: number,
    revision: { estado: 'APROBADO' | 'RECHAZADO'; observaciones: string | null },
    resolverEstado: ResolverEstadoRevision,
  ): Promise<ResultadoDocumento | null>;
  buscarPorId(idDocumento: number): Promise<DocumentoVerificacion | null>;
  listarDeVendedor(idVendedor: number): Promise<DocumentoVerificacion[]>;
  obtenerEstadoVendedor(idVendedor: number): Promise<EstadoVerificacion | null>;
  listarPorEstado(
    estado: EstadoRevision,
    paginacion: { page: number; limit: number },
  ): Promise<{ items: DocumentoConVendedor[]; total: number }>;
}
