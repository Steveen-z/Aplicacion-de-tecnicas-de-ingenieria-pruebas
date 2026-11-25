import { Rol } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';

export type EstadoCuenta = 'ACTIVA' | 'INACTIVA' | 'BLOQUEADA';
export type EstadoCuentaAdministrable = 'ACTIVA' | 'BLOQUEADA';

export interface UsuarioAdminResumen {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  telefono: string | null;
  rol: Rol;
  estadoCuenta: EstadoCuenta;
  fechaRegistro: Date;
  idVendedor: number | null;
  estadoVerificacion: string | null;
}

export interface FiltroUsuariosAdmin {
  rol?: Rol;
  estado?: EstadoCuenta;
  /** Texto en nombre o correo. */
  q?: string;
}

export const MOTIVO_MAX = 500;

/**
 * Reglas para que un ADMIN cambie el estado de una cuenta.
 * Orden fijo (403 antes que 422) para que un reintento idéntico dé siempre la misma respuesta.
 * - Un admin no puede bloquearse a sí mismo ni bloquear a otro admin (así nunca queda sin admins).
 * - Bloquear exige motivo. Pedir el estado actual no es error: no cambia nada (idempotente).
 * Devuelve el motivo normalizado.
 */
export function decidirCambioEstado(datos: {
  idActor: number;
  objetivo: Pick<UsuarioAdminResumen, 'idUsuario' | 'rol'>;
  nuevoEstado: EstadoCuentaAdministrable;
  motivo?: string | null;
}): { motivo: string | null } {
  const motivo = datos.motivo?.trim() || null;
  if (datos.nuevoEstado === 'BLOQUEADA') {
    if (datos.objetivo.idUsuario === datos.idActor) {
      throw new ForbiddenError('No puedes bloquear tu propia cuenta');
    }
    if (datos.objetivo.rol === 'ADMIN') {
      throw new ForbiddenError('No se puede bloquear a un administrador');
    }
    if (!motivo) throw new BusinessRuleError('Indica el motivo del bloqueo');
  }
  if (motivo && motivo.length > MOTIVO_MAX) {
    throw new BusinessRuleError(`El motivo no puede superar ${MOTIVO_MAX} caracteres`);
  }
  return { motivo };
}
