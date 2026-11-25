/** Auditoría de operaciones administrativas (documento de arquitectura: actor, acción, fecha y registro). */
export const ACCIONES_AUDITORIA = [
  'USUARIO_BLOQUEADO',
  'USUARIO_ACTIVADO',
  'PUBLICACION_RECHAZADA',
  'PUBLICACION_RESTAURADA',
  'DOCUMENTO_APROBADO',
  'DOCUMENTO_RECHAZADO',
] as const;
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

export const ENTIDADES_AUDITORIA = ['USUARIO', 'PUBLICACION', 'DOCUMENTO'] as const;
export type EntidadAuditoria = (typeof ENTIDADES_AUDITORIA)[number];

/**
 * Registro a insertar. Lo escribe el repositorio del caso de uso DENTRO de la misma
 * transacción que la acción: si una falla, fallan las dos.
 */
export interface NuevaAuditoria {
  idActor: number;
  accion: AccionAuditoria;
  entidad: EntidadAuditoria;
  idEntidad: number;
  /** Ids, estados y motivo; sin datos personales adicionales. */
  detalle: Record<string, unknown>;
}
