export type EstadoPublicacion = 'ACTIVA' | 'PAUSADA' | 'VENDIDA' | 'RENTADA' | 'PENDIENTE' | 'RECHAZADA';
export type TipoOperacion = 'VENTA' | 'RENTA';

export interface Fotografia {
  idFotografia: number;
  urlImagen: string;
  descripcion: string | null;
  orden: number;
  esPortada: boolean;
}

export interface DatosTerreno {
  areaM2: number;
  largoM: number | null;
  anchoM: number | null;
  tipoTerreno: string | null;
  caracteristicas: string | null;
}

export interface Terreno extends DatosTerreno {
  idTerreno: number;
}

export interface DatosUbicacion {
  departamento: string;
  municipio: string;
  distrito: string | null;
  direccionDetalle: string | null;
  /** Coordenadas exactas: solo las ve el propietario y el administrador. */
  latitud: number | null;
  longitud: number | null;
  /** Punto aproximado que se muestra al resto de usuarios. */
  latitudPublica: number | null;
  longitudPublica: number | null;
}

export interface VendedorResumen {
  idVendedor: number;
  idUsuario: number;
  nombre: string;
  telefono: string | null;
  numeroWhatsapp: string | null;
  estadoVerificacion: string;
  /** Una cuenta BLOQUEADA no muestra sus publicaciones al público. */
  estadoCuenta: string;
}

export interface Publicacion {
  idPublicacion: number;
  idVendedor: number;
  titulo: string;
  descripcion: string;
  tipoOperacion: TipoOperacion;
  precio: number;
  estado: EstadoPublicacion;
  fechaPublicacion: Date;
  fechaActualizacion: Date;
  terreno: Terreno;
  ubicacion: DatosUbicacion;
  fotografias: Fotografia[];
  vendedor: VendedorResumen;
  /** Motivo de moderación; solo con estado RECHAZADA. */
  motivoRechazo: string | null;
}

/** Fila del listado (P04/P05). No incluye datos sensibles. */
export interface PublicacionResumen {
  idPublicacion: number;
  titulo: string;
  tipoOperacion: TipoOperacion;
  precio: number;
  estado: EstadoPublicacion;
  areaM2: number;
  departamento: string;
  municipio: string;
  distrito: string | null;
  portadaUrl: string | null;
  fechaPublicacion: Date;
  /** Punto PÚBLICO (aproximado) para el marcador del mapa; nunca el exacto. */
  latitud: number | null;
  longitud: number | null;
  /** Distancia en km al centro de búsqueda (solo cuando se busca por cercanía). */
  distanciaKm: number | null;
}

export interface CambioPrecio {
  idHistorial: number;
  precioAnterior: number;
  precioNuevo: number;
  fechaCambio: Date;
}

export type OrdenPublicaciones = 'RECIENTES' | 'PRECIO_ASC' | 'PRECIO_DESC' | 'AREA_ASC' | 'AREA_DESC' | 'DISTANCIA';

/** Búsqueda por cercanía (documento de arquitectura: centro + radio con PostGIS). */
export interface Cercania {
  latitud: number;
  longitud: number;
  radioKm: number;
}

export const RADIO_MIN_KM = 0.1;
export const RADIO_MAX_KM = 50;

export interface FiltroPublicaciones {
  departamento?: string;
  municipio?: string;
  tipoOperacion?: TipoOperacion;
  precioMin?: number;
  precioMax?: number;
  areaMin?: number;
  areaMax?: number;
  q?: string;
  cercania?: Cercania;
  orden: OrdenPublicaciones;
}

export interface NuevaFotografia {
  urlImagen: string;
  descripcion: string | null;
  esPortada: boolean;
}

export interface NuevaPublicacion {
  idVendedor: number;
  titulo: string;
  descripcion: string;
  tipoOperacion: TipoOperacion;
  precio: number;
  terreno: DatosTerreno;
  ubicacion: DatosUbicacion;
  fotografias: NuevaFotografia[];
}

export interface CambiosPublicacion {
  titulo?: string;
  descripcion?: string;
  terreno?: Partial<DatosTerreno>;
  ubicacion?: Partial<DatosUbicacion>;
}
