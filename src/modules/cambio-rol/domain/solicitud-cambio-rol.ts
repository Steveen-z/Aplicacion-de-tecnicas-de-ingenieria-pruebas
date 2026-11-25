import { Rol } from '../../../shared/domain/auth-user';
import { esDuiValido, esTelefonoValido } from '../../../shared/domain/validators';

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface SolicitudCambioRol {
  idSolicitud: number;
  fechaSolicitud: Date;
  estado: EstadoSolicitud;
  requisitosPendientes: string | null;
  fechaResolucion: Date | null;
  observaciones: string | null;
}

export interface PerfilParaCambioRol {
  idUsuario: number;
  nombreCompleto: string;
  telefono: string | null;
  rol: Rol;
  idVendedor: number | null;
}

export interface DatosVendedorSolicitados {
  dui: string;
  numeroWhatsapp: string | null;
}

/**
 * Requisitos para pasar de cliente a vendedor (P03): perfil completo, teléfono de
 * contacto válido, DUI con formato correcto y, si se indica, WhatsApp válido.
 * Devuelve la lista de requisitos pendientes (vacía = cumple).
 */
export function evaluarRequisitosVendedor(
  perfil: Pick<PerfilParaCambioRol, 'nombreCompleto' | 'telefono'>,
  datos: DatosVendedorSolicitados,
): string[] {
  const pendientes: string[] = [];
  if (perfil.nombreCompleto.trim().length < 3) {
    pendientes.push('Completa tu nombre en el perfil');
  }
  if (!esTelefonoValido(perfil.telefono)) {
    pendientes.push('Registra un teléfono de contacto válido en tu perfil');
  }
  if (!esDuiValido(datos.dui)) {
    pendientes.push('Ingresa un DUI con el formato 00000000-0');
  }
  if (datos.numeroWhatsapp !== null && !esTelefonoValido(datos.numeroWhatsapp)) {
    pendientes.push('El número de WhatsApp no tiene un formato válido');
  }
  return pendientes;
}
