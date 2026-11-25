import { PuntoInteres } from './ubicacion-cercania';

export const SERVICIO_MAPAS = Symbol('SERVICIO_MAPAS');

export interface MapaPublicacion {
  centro: { latitud: number; longitud: number };
  zoom: number;
  /** URL para un <iframe> con el mapa y el marcador. */
  urlIncrustada: string;
  /** Enlace para abrir el mapa completo en el navegador. */
  urlMapa: string;
}

/** Puerto del servicio externo de mapas (UML: «external» ServicioMapas). */
export interface ServicioMapas {
  obtenerMapa(latitud: number, longitud: number): MapaPublicacion;
  /** Devuelve null si el servicio externo no está disponible (no debe romper el detalle). */
  buscarPuntosInteres(latitud: number, longitud: number, radioMetros: number): Promise<PuntoInteres[] | null>;
}
