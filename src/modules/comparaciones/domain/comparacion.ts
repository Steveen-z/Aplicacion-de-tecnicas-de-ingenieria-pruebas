import { BusinessRuleError } from '../../../shared/domain/errors';

export const MIN_TERRENOS_COMPARACION = 2;
export const MAX_TERRENOS_COMPARACION = 4;

export interface TerrenoComparable {
  idPublicacion: number;
  titulo: string;
  tipoOperacion: string;
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
    throw new BusinessRuleError(`Selecciona al menos ${MIN_TERRENOS_COMPARACION} terrenos distintos para comparar`);
  }
  if (unicos.length > MAX_TERRENOS_COMPARACION) {
    throw new BusinessRuleError(`Solo se pueden comparar hasta ${MAX_TERRENOS_COMPARACION} terrenos a la vez`);
  }
  return unicos;
}

/** Comparar una venta con una renta no tiene sentido (los precios no son equivalentes). */
export function validarMismaOperacion(terrenos: TerrenoComparable[]): void {
  if (new Set(terrenos.map((t) => t.tipoOperacion)).size > 1) {
    throw new BusinessRuleError('Solo se pueden comparar terrenos con el mismo tipo de operación (venta o renta)');
  }
}

/** Indica cuál terreno destaca en cada aspecto (el resumen que acompaña la vista lado a lado). */
export function construirResumen(terrenos: TerrenoComparable[]): ResumenComparacion | null {
  if (terrenos.length === 0) return null;
  const mejor = (valor: (t: TerrenoComparable) => number, direccion: 1 | -1): number =>
    terrenos.reduce((acc, t) => (valor(t) * direccion < valor(acc) * direccion ? t : acc)).idPublicacion;

  return {
    menorPrecio: mejor((t) => t.precio, 1),
    mayorArea: mejor((t) => t.areaM2, -1),
    menorPrecioPorM2: mejor((t) => t.precioPorM2, 1),
  };
}
