import { Usuario } from './usuario';

export const SESION_REPOSITORY = Symbol('SESION_REPOSITORY');

export interface SesionActiva {
  idSesion: number;
  fechaExpiracion: Date;
  usuario: Usuario;
}

export interface SesionRepository {
  crear(datos: { idUsuario: number; tokenHash: string; fechaExpiracion: Date }): Promise<number>;
  /** Devuelve la sesión solo si está activa, no finalizada y no expirada. */
  buscarActivaPorHash(tokenHash: string): Promise<SesionActiva | null>;
  finalizar(idSesion: number): Promise<void>;
}
