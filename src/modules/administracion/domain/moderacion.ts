import { BusinessRuleError } from '../../../shared/domain/errors';
import { EstadoPublicacion } from '../../publicaciones/domain/publicacion';
import { MOTIVO_MAX } from './usuario-admin';

export type AccionModeracion = 'RECHAZAR' | 'RESTAURAR';

export interface DecisionModeracion {
  desde: EstadoPublicacion[];
  hacia: EstadoPublicacion;
  motivo: string | null;
}

/**
 * Moderación de publicaciones por el administrador (documento: "supervisar y moderar").
 * - RECHAZAR: solo ACTIVA o PAUSADA, con motivo obligatorio -> RECHAZADA.
 * - RESTAURAR: solo RECHAZADA -> PAUSADA (el vendedor decide cuándo reactivarla).
 * `desde` se usa en el UPDATE condicional para no pisar un cambio concurrente del vendedor.
 */
export function calcularModeracion(
  accion: AccionModeracion,
  estadoActual: EstadoPublicacion,
  motivoEntrada?: string | null,
): DecisionModeracion {
  const motivo = motivoEntrada?.trim() || null;
  if (motivo && motivo.length > MOTIVO_MAX) {
    throw new BusinessRuleError(`El motivo no puede superar ${MOTIVO_MAX} caracteres`);
  }
  if (accion === 'RECHAZAR') {
    const desde: EstadoPublicacion[] = ['ACTIVA', 'PAUSADA'];
    if (!desde.includes(estadoActual)) {
      throw new BusinessRuleError(`No se puede rechazar una publicación en estado ${estadoActual}`);
    }
    if (!motivo) throw new BusinessRuleError('Indica el motivo del rechazo');
    return { desde, hacia: 'RECHAZADA', motivo };
  }
  if (estadoActual !== 'RECHAZADA') {
    throw new BusinessRuleError('Solo se puede restaurar una publicación rechazada');
  }
  return { desde: ['RECHAZADA'], hacia: 'PAUSADA', motivo };
}

export function avisoModeracion(accion: AccionModeracion, titulo: string, motivo: string | null) {
  return accion === 'RECHAZAR'
    ? {
        tipo: 'PUBLICACION_RECHAZADA',
        titulo: 'Tu publicación fue rechazada',
        mensaje: `"${titulo}" fue rechazada por moderación. Motivo: ${motivo}`,
      }
    : {
        tipo: 'PUBLICACION_RESTAURADA',
        titulo: 'Tu publicación fue restaurada',
        mensaje: `"${titulo}" fue restaurada y quedó pausada. Puedes reactivarla cuando quieras.${motivo ? ` Nota: ${motivo}` : ''}`,
      };
}
