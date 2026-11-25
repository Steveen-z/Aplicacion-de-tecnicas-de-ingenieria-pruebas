import { DatosVendedorSolicitados, PerfilParaCambioRol, SolicitudCambioRol } from './solicitud-cambio-rol';

export const CAMBIO_ROL_REPOSITORY = Symbol('CAMBIO_ROL_REPOSITORY');

export interface CambioRolRepository {
  obtenerPerfil(idUsuario: number): Promise<PerfilParaCambioRol | null>;
  duiEnUso(dui: string): Promise<boolean>;
  /**
   * En una sola transacción: registra la solicitud como APROBADA, crea el perfil
   * de vendedor y actualiza usuarios.rol a VENDEDOR.
   */
  aprobarCambio(
    idUsuario: number,
    datos: DatosVendedorSolicitados,
  ): Promise<{ idSolicitud: number; idVendedor: number }>;
  /** Registra una solicitud RECHAZADA con los requisitos que faltaban (trazabilidad de P03). */
  registrarRechazo(idUsuario: number, requisitosPendientes: string[]): Promise<void>;
  listarSolicitudes(idUsuario: number): Promise<SolicitudCambioRol[]>;
}
