import { BusinessRuleError } from '../../../shared/domain/errors';

export const MIN_TERRENOS_COMPARACION = 2;
export const MAX_TERRENOS_COMPARACION = 4;

export interface TerrenoComparable {
  idPublicacion: number;
  titulo: string;
  tipoOperacion: string;
  /** CASA | LOTE | TERRENO: solo se comparan inmuebles del mismo tipo. */
  tipoPropiedad: string;
  /** Datos de casa (null en LOTE y TERRENO). */
  habitaciones: number | null;
  banos: number | null;
  areaConstruidaM2: number | null;
  precio: number;
  estado: string;
  /** false si la publicación ya no está activa (se pausó, se vendió...). */
  disponible: boolean;
  areaM2: number;
  largoM: number | null;
  anchoM: number | null;
  tipoTerreno: string | null;
  caracteristicas: string | null;
  departamento: string;
  municipio: string;
  distrito: string | null;
  portadaUrl: string | null;
  precioPorM2: number;
}

export interface ResumenComparacion {
  menorPrecio: number;
  mayorArea: number;
  menorPrecioPorM2: number;
  /** Solo al comparar casas. */
  masHabitaciones?: number;
  mayorAreaConstruida?: number;
}

export interface ComparacionGuardada {
  idComparacion: number;
  fechaCreacion: Date;
  idsPublicaciones: number[];
}

/** UML: GestorComparaciones.validarMinimos. Devuelve los ids sin repetir. */
export function validarSeleccion(ids: number[]): number[] {
  const unicos = [...new Set(ids)];
  if (unicos.length < MIN_TERRENOS_COMPARACION) {
    throw new BusinessRuleError(`Selecciona al menos ${MIN_TERRENOS_COMPARACION} inmuebles distintos para comparar`);
  }
  if (unicos.length > MAX_TERRENOS_COMPARACION) {
    throw new BusinessRuleError(`Solo se pueden comparar hasta ${MAX_TERRENOS_COMPARACION} inmuebles a la vez`);
  }
  return unicos;
}

/** Comparar una venta con una renta no tiene sentido (los precios no son equivalentes). */
export function validarMismaOperacion(terrenos: TerrenoComparable[]): void {
  if (new Set(terrenos.map((t) => t.tipoOperacion)).size > 1) {
    throw new BusinessRuleError('Solo se pueden comparar inmuebles con el mismo tipo de operación (venta o renta)');
  }
}

/**
 * Precio por m² y área solo son comparables entre inmuebles del mismo tipo: en una casa el
 * precio incluye la construcción. Regla uniforme: no se mezclan CASA, LOTE y TERRENO.
 */
export function validarMismoTipoPropiedad(terrenos: TerrenoComparable[]): void {
  const tipos = [...new Set(terrenos.map((t) => t.tipoPropiedad))];
  if (tipos.length > 1) {
    throw new BusinessRuleError('Solo se pueden comparar inmuebles del mismo tipo (casa, lote o terreno)', {
      tiposPropiedad: tipos,
    });
  }
}

/** Indica cuál terreno destaca en cada aspecto (el resumen que acompaña la vista lado a lado). */
export function construirResumen(terrenos: TerrenoComparable[]): ResumenComparacion | null {
  if (terrenos.length === 0) return null;
  const mejor = (valor: (t: TerrenoComparable) => number, direccion: 1 | -1): number =>
    terrenos.reduce((acc, t) => (valor(t) * direccion < valor(acc) * direccion ? t : acc)).idPublicacion;

  const resumen: ResumenComparacion = {
    menorPrecio: mejor((t) => t.precio, 1),
    mayorArea: mejor((t) => t.areaM2, -1),
    menorPrecioPorM2: mejor((t) => t.precioPorM2, 1),
  };
  if (terrenos.every((t) => t.tipoPropiedad === 'CASA')) {
    resumen.masHabitaciones = mejor((t) => t.habitaciones ?? 0, -1);
    resumen.mayorAreaConstruida = mejor((t) => t.areaConstruidaM2 ?? 0, -1);
  }
  return resumen;
}
