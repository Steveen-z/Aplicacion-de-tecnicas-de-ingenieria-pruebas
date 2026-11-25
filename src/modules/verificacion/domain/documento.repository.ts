import { NuevaAuditoria } from '../../../shared/domain/auditoria';
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
  /**
   * En una transacción: revisa el documento solo si sigue PENDIENTE (UPDATE condicional),
   * recalcula el estado del vendedor y escribe la auditoría.
   * null si no existe; 'YA_REVISADO' si otro administrador lo revisó primero.
   */
  revisarDocumento(
    idDocumento: number,
    revision: { estado: 'APROBADO' | 'RECHAZADO'; observaciones: string | null },
    resolverEstado: ResolverEstadoRevision,
    construirAuditoria: (resultado: ResultadoDocumento) => NuevaAuditoria,
  ): Promise<ResultadoDocumento | 'YA_REVISADO' | null>;
  buscarPorId(idDocumento: number): Promise<DocumentoVerificacion | null>;
  listarDeVendedor(idVendedor: number): Promise<DocumentoVerificacion[]>;
  obtenerEstadoVendedor(idVendedor: number): Promise<EstadoVerificacion | null>;
  listarPorEstado(
    estado: EstadoRevision,
    paginacion: { page: number; limit: number },
  ): Promise<{ items: DocumentoConVendedor[]; total: number }>;
}
