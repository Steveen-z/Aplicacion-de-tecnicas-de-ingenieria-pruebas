export const BAJA_PRECIO_NOTIFIER = Symbol('BAJA_PRECIO_NOTIFIER');

export interface BajaPrecio {
  idPublicacion: number;
  titulo: string;
  precioAnterior: number;
  precioNuevo: number;
  /** El propio vendedor no recibe el aviso aunque tenga la publicación en favoritos. */
  excluirIdUsuario: number;
}

/** Puerto: avisa a los clientes que tienen la publicación en favoritos (P11). */
export interface BajaPrecioNotifier {
  /** Devuelve cuántos usuarios fueron notificados. */
  notificar(baja: BajaPrecio): Promise<number>;
}
