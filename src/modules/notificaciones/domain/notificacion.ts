export interface Notificacion {
  idNotificacion: number;
  idPublicacion: number | null;
  titulo: string;
  mensaje: string;
  tipo: string;
  fechaCreacion: Date;
  leida: boolean;
  fechaLectura: Date | null;
}

export const NOTIFICACION_REPOSITORY = Symbol('NOTIFICACION_REPOSITORY');

export interface NotificacionRepository {
  listar(
    idUsuario: number,
    opciones: { soloNoLeidas: boolean; page: number; limit: number },
  ): Promise<{ items: Notificacion[]; total: number }>;
  contarNoLeidas(idUsuario: number): Promise<number>;
  /** false si la notificación no existe o no es del usuario. Idempotente si ya estaba leída. */
  marcarLeida(idUsuario: number, idNotificacion: number): Promise<boolean>;
  /** Devuelve cuántas se marcaron. */
  marcarTodasLeidas(idUsuario: number): Promise<number>;
}
