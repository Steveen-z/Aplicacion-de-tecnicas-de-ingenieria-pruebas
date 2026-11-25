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
import { AvisoBajaPrecio } from './baja-precio';

/** Cómo decidir el aviso con los datos leídos bajo bloqueo (la regla vive en el dominio). */
export interface AvisoCambioPrecio {
  /** El vendedor no recibe su propio aviso aunque tenga la publicación en favoritos. */
  excluirIdUsuario: number;
  decidir(datos: { titulo: string; estado: EstadoPublicacion; precioAnterior: number }): AvisoBajaPrecio | null;
}

export interface ResultadoCambioPrecio {
  precioAnterior: number;
  huboCambio: boolean;
  /** Notificaciones BAJA_PRECIO creadas en la misma transacción. */
  avisosCreados: number;
}

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
  /**
   * UPDATE condicional (WHERE estado = desde): false si el estado ya no era `desde`
   * (p. ej. el administrador la rechazó mientras tanto). Evita pisar cambios concurrentes.
   */
  cambiarEstado(idPublicacion: number, desde: EstadoPublicacion, hacia: EstadoPublicacion): Promise<boolean>;
  /**
   * En UNA transacción (con bloqueo de fila): lee precio y estado; si el precio es distinto,
   * actualiza publicaciones.precio, inserta en historial_precios y, si `aviso.decidir`
   * devuelve un aviso, crea las notificaciones de los interesados ligadas a ese historial.
   * Si algo falla se revierte todo (precio, historial y avisos).
   */
  registrarCambioPrecio(
    idPublicacion: number,
    nuevoPrecio: number,
    aviso: AvisoCambioPrecio,
  ): Promise<ResultadoCambioPrecio>;
  listarHistorialPrecios(idPublicacion: number): Promise<CambioPrecio[]>;
  /** Agrega fotos al final del orden y devuelve la galería completa. */
  agregarFotografias(idPublicacion: number, fotos: NuevaFotografia[]): Promise<Fotografia[]>;
  /** false si la fotografía no existe en esa publicación. Si era la portada, promueve otra. */
  eliminarFotografia(idPublicacion: number, idFotografia: number): Promise<boolean>;
  /** false si la fotografía no existe en esa publicación. */
  definirPortada(idPublicacion: number, idFotografia: number): Promise<boolean>;
}
