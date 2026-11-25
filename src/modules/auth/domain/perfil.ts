import { Rol } from '../../../shared/domain/auth-user';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { esTelefonoValido, normalizarTelefono } from '../../../shared/domain/validators';

export interface CambiosPerfil {
  nombreCompleto?: string;
  /** null o "" borra el teléfono. */
  telefono?: string | null;
}

export interface DatosPerfilAGuardar {
  nombreCompleto?: string;
  telefono?: string | null;
  telefonoVerificado?: boolean;
}

/**
 * Reglas para que un usuario edite su propio perfil (documento de arquitectura: "Su perfil").
 * - Solo nombre y teléfono; correo, rol y estado no se editan aquí.
 * - El teléfono se normaliza y valida; un VENDEDOR no puede quedarse sin teléfono (es su contacto).
 * - Si el teléfono cambia, deja de estar verificado.
 */
export function validarCambioPerfil(
  actual: { rol: Rol; telefono: string | null },
  cambios: CambiosPerfil,
): DatosPerfilAGuardar {
  const datos: DatosPerfilAGuardar = {};

  if (cambios.nombreCompleto !== undefined) {
    const nombre = cambios.nombreCompleto.trim();
    if (nombre.length < 3 || nombre.length > 150) {
      throw new BusinessRuleError('El nombre debe tener entre 3 y 150 caracteres');
    }
    datos.nombreCompleto = nombre;
  }

  if (cambios.telefono !== undefined) {
    const vacio = cambios.telefono === null || cambios.telefono.trim() === '';
    if (vacio) {
      if (actual.rol === 'VENDEDOR') {
        throw new BusinessRuleError('Una cuenta de vendedor debe tener un teléfono de contacto');
      }
      datos.telefono = null;
    } else {
      const telefono = normalizarTelefono(cambios.telefono!);
      if (!esTelefonoValido(telefono)) throw new BusinessRuleError('El teléfono no tiene un formato válido');
      datos.telefono = telefono;
    }
    if (datos.telefono !== actual.telefono) datos.telefonoVerificado = false;
  }

  if (Object.keys(datos).length === 0) {
    throw new BusinessRuleError('Indica al menos un dato del perfil para actualizar');
  }
  return datos;
}
