export type CategoriaPuntoInteres = 'EDUCACION' | 'SALUD' | 'TRANSPORTE' | 'COMERCIO';
export type ValoracionUbicacion = 'FAVORABLE' | 'ACEPTABLE' | 'LIMITADA' | 'SIN_DATOS';

export interface PuntoInteres {
  nombre: string | null;
  categoria: CategoriaPuntoInteres;
  latitud: number;
  longitud: number;
  distanciaM: number;
}

export interface EvaluacionUbicacion {
  nivel: ValoracionUbicacion;
  categoriasCubiertas: CategoriaPuntoInteres[];
  resumen: string;
}

const RADIO_TIERRA_M = 6_371_000;

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a)));
}

/**
 * UML: Ubicacion.evaluarCercania. Valora la ubicación según cuántos tipos de servicio
 * (educación, salud, transporte, comercio) hay cerca.
 * `puntos === null` significa que el servicio de mapas no respondió.
 */
export function evaluarCercania(puntos: PuntoInteres[] | null): EvaluacionUbicacion {
  if (puntos === null) {
    return {
      nivel: 'SIN_DATOS',
      categoriasCubiertas: [],
      resumen: 'No fue posible consultar los puntos de interés en este momento',
    };
  }

  const categoriasCubiertas = [...new Set(puntos.map((p) => p.categoria))];
  const cubiertas = categoriasCubiertas.length;

  if (cubiertas >= 3) {
    return { nivel: 'FAVORABLE', categoriasCubiertas, resumen: 'Zona con buenos servicios cercanos' };
  }
  if (cubiertas === 2) {
    return { nivel: 'ACEPTABLE', categoriasCubiertas, resumen: 'Zona con algunos servicios cercanos' };
  }
  return { nivel: 'LIMITADA', categoriasCubiertas, resumen: 'Pocos servicios registrados cerca de la zona' };
}
