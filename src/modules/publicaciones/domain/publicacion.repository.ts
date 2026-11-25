import {
  CambioPrecio,
  CambiosPublicacion,
  EstadoPublicacion,
  Fotografia,
  FiltroPublicaciones,
  NuevaFotografia,
  NuevaPublicacion,
  Publicacion,
  PublicacionResumen,
} from './publicacion';

export const PUBLICACION_REPOSITORY = Symbol('PUBLICACION_REPOSITORY');

export interface Paginacion {
  page: number;
  limit: number;
}

export interface ResultadoListado {
  items: PublicacionResumen[];
  total: number;
}

export interface PublicacionRepository {
  /** Crea publicación + terreno + ubicación + fotografías de forma atómica (estado ACTIVA). */
  crear(datos: NuevaPublicacion): Promise<Publicacion>;
  buscarPorId(idPublicacion: number): Promise<Publicacion | null>;
  /** Solo publicaciones ACTIVAS que cumplen el filtro. */
  buscarActivas(filtro: FiltroPublicaciones, paginacion: Paginacion): Promise<ResultadoListado>;
  listarDeVendedor(
    idVendedor: number,
    estado: EstadoPublicacion | undefined,
    paginacion: Paginacion,
  ): Promise<ResultadoListado>;
  actualizar(idPublicacion: number, cambios: CambiosPublicacion): Promise<Publicacion>;
  cambiarEstado(idPublicacion: number, estado: EstadoPublicacion): Promise<void>;
  /**
   * En una transacción (con bloqueo de fila): lee el precio actual y, si es distinto,
   * actualiza publicaciones.precio e inserta en historial_precios.
   */
  registrarCambioPrecio(
    idPublicacion: number,
    nuevoPrecio: number,
  ): Promise<{ precioAnterior: number; huboCambio: boolean }>;
  listarHistorialPrecios(idPublicacion: number): Promise<CambioPrecio[]>;
  /** Agrega fotos al final del orden y devuelve la galería completa. */
  agregarFotografias(idPublicacion: number, fotos: NuevaFotografia[]): Promise<Fotografia[]>;
  /** false si la fotografía no existe en esa publicación. Si era la portada, promueve otra. */
  eliminarFotografia(idPublicacion: number, idFotografia: number): Promise<boolean>;
  /** false si la fotografía no existe en esa publicación. */
  definirPortada(idPublicacion: number, idFotografia: number): Promise<boolean>;
}
