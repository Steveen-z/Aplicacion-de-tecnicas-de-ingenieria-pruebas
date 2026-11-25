export const TIPOS_DOCUMENTO = ['DUI_FRENTE', 'DUI_REVERSO', 'COMPROBANTE_PROPIEDAD', 'OTRO'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type EstadoRevision = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type EstadoVerificacion = 'PENDIENTE' | 'EN_REVISION' | 'VERIFICADO' | 'RECHAZADO';

export interface DocumentoVerificacion {
  idDocumento: number;
  idVendedor: number;
  tipoDocumento: string;
  rutaDocumento: string;
  fechaEnvio: Date;
  estadoRevision: EstadoRevision;
  observaciones: string | null;
  fechaRevision: Date | null;
}

export interface DocumentoConVendedor extends DocumentoVerificacion {
  vendedor: { idVendedor: number; nombre: string; correo: string; dui: string | null };
}

type DocumentoResumen = Pick<DocumentoVerificacion, 'idDocumento' | 'tipoDocumento' | 'estadoRevision'>;

/**
 * Estado de verificación del vendedor a partir de sus documentos. Solo cuenta el
 * documento más reciente de cada tipo: así, un documento rechazado se "reemplaza"
 * al volver a subirlo.
 *   - sin documentos          -> PENDIENTE
 *   - alguno rechazado        -> RECHAZADO
 *   - todos aprobados         -> VERIFICADO
 *   - en cualquier otro caso  -> EN_REVISION
 */
export function calcularEstadoVerificacion(documentos: DocumentoResumen[]): EstadoVerificacion {
  const ultimoPorTipo = new Map<string, DocumentoResumen>();
  for (const doc of documentos) {
    const previo = ultimoPorTipo.get(doc.tipoDocumento);
    if (!previo || doc.idDocumento > previo.idDocumento) ultimoPorTipo.set(doc.tipoDocumento, doc);
  }
  const vigentes = [...ultimoPorTipo.values()];

  if (vigentes.length === 0) return 'PENDIENTE';
  if (vigentes.some((d) => d.estadoRevision === 'RECHAZADO')) return 'RECHAZADO';
  if (vigentes.every((d) => d.estadoRevision === 'APROBADO')) return 'VERIFICADO';
  return 'EN_REVISION';
}

/** Un vendedor ya verificado no pierde la verificación solo por enviar un documento adicional. */
export function estadoTrasEnvio(actual: EstadoVerificacion, documentos: DocumentoResumen[]): EstadoVerificacion {
  return actual === 'VERIFICADO' ? 'VERIFICADO' : calcularEstadoVerificacion(documentos);
}

export type ResolverEstadoEnvio = (actual: EstadoVerificacion, documentos: DocumentoResumen[]) => EstadoVerificacion;
export type ResolverEstadoRevision = (documentos: DocumentoResumen[]) => EstadoVerificacion;
