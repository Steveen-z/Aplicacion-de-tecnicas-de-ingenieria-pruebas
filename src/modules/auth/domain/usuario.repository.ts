import { Usuario, UsuarioConCredenciales } from './usuario';

export const USUARIO_REPOSITORY = Symbol('USUARIO_REPOSITORY');

export interface NuevoUsuario {
  nombreCompleto: string;
  correo: string;
  passwordHash: string;
  telefono: string | null;
}

export interface DatosVendedor {
  dui: string;
  numeroWhatsapp: string | null;
}

export interface UsuarioRepository {
  existePorCorreo(correo: string): Promise<boolean>;
  existeDui(dui: string): Promise<boolean>;
  /** Crea el usuario (rol CLIENTE) y su perfil de cliente. */
  crearCliente(datos: NuevoUsuario): Promise<Usuario>;
  /** Crea el usuario (rol VENDEDOR) con su perfil de vendedor y de cliente. */
  crearVendedor(datos: NuevoUsuario & DatosVendedor): Promise<Usuario>;
  buscarConCredencialesPorCorreo(correo: string): Promise<UsuarioConCredenciales | null>;
  buscarPorId(idUsuario: number): Promise<Usuario | null>;
}
