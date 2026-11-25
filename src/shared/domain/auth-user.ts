export type Rol = 'CLIENTE' | 'VENDEDOR' | 'ADMIN';

/** Usuario autenticado que viaja en `request.user` una vez validada la sesión. */
export interface AuthUser {
  idUsuario: number;
  idSesion: number;
  nombreCompleto: string;
  correo: string;
  rol: Rol;
  /** Perfil de cliente (todos los usuarios registrados por la API lo tienen). */
  idCliente: number | null;
  /** Perfil de vendedor, solo si el rol es VENDEDOR. */
  idVendedor: number | null;
}
