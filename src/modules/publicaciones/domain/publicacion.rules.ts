import { BusinessRuleError } from '../../../shared/domain/errors';
import { DatosCasa, EstadoPublicacion, TipoOperacion, TipoPropiedad } from './publicacion';

export const MAX_FOTOGRAFIAS = 20;

export type AccionEstado = 'PAUSAR' | 'REACTIVAR' | 'MARCAR_VENDIDA' | 'MARCAR_RENTADA';

/** Una publicación cerrada (vendida/rentada) o rechazada ya no se edita. */
export function puedeEditarse(estado: EstadoPublicacion): boolean {
  return estado === 'ACTIVA' || estado === 'PAUSADA' || estado === 'PENDIENTE';
}

/**
 * Máquina de estados del ciclo de vida (UML: pausar, reactivar, marcarVendida, marcarRentada).
 *   ACTIVA  -> PAUSADA | VENDIDA (venta) | RENTADA (renta)
 *   PAUSADA -> ACTIVA  | VENDIDA (venta) | RENTADA (renta)
 * Devuelve el nuevo estado o lanza BusinessRuleError si la transición no es válida.
 */
export function calcularNuevoEstado(
  accion: AccionEstado,
  publicacion: { estado: EstadoPublicacion; tipoOperacion: TipoOperacion; totalFotografias: number },
): EstadoPublicacion {
  const { estado, tipoOperacion, totalFotografias } = publicacion;

  switch (accion) {
    case 'PAUSAR':
      if (estado !== 'ACTIVA') {
        throw new BusinessRuleError('Solo se puede pausar una publicación activa');
      }
      return 'PAUSADA';

    case 'REACTIVAR':
      if (estado !== 'PAUSADA') {
        throw new BusinessRuleError('Solo se puede reactivar una publicación pausada');
      }
      if (totalFotografias < 1) {
        throw new BusinessRuleError('La publicación necesita al menos una fotografía para activarse');
      }
      return 'ACTIVA';

    case 'MARCAR_VENDIDA':
      if (tipoOperacion !== 'VENTA') {
        throw new BusinessRuleError('Una publicación de renta no se puede marcar como vendida');
      }
      if (estado !== 'ACTIVA' && estado !== 'PAUSADA') {
        throw new BusinessRuleError('La publicación no está en un estado que permita marcarla como vendida');
      }
      return 'VENDIDA';

    case 'MARCAR_RENTADA':
      if (tipoOperacion !== 'RENTA') {
        throw new BusinessRuleError('Una publicación de venta no se puede marcar como rentada');
      }
      if (estado !== 'ACTIVA' && estado !== 'PAUSADA') {
        throw new BusinessRuleError('La publicación no está en un estado que permita marcarla como rentada');
      }
      return 'RENTADA';
  }
}

/**
 * Punto aproximado que se muestra públicamente (UML: Ubicacion.obtenerPuntoAproximado).
 * Se redondea a 2 decimales (celdas de ~1 km): suficiente para ubicar la zona en el
 * mapa sin revelar el predio exacto.
 */
export function aproximarCoordenadas(
  latitud: number | null,
  longitud: number | null,
): { latitudPublica: number | null; longitudPublica: number | null } {
  if (latitud === null || longitud === null) {
    return { latitudPublica: null, longitudPublica: null };
  }
  const redondear = (v: number) => Math.round(v * 100) / 100;
  return { latitudPublica: redondear(latitud), longitudPublica: redondear(longitud) };
}

/** Las coordenadas se envían juntas o no se envían. */
export function validarParCoordenadas(latitud: number | null | undefined, longitud: number | null | undefined): void {
  const tieneLat = latitud !== null && latitud !== undefined;
  const tieneLng = longitud !== null && longitud !== undefined;
  if (tieneLat !== tieneLng) {
    throw new BusinessRuleError('La latitud y la longitud deben enviarse juntas');
  }
}

// ---------------------------------------------------------------- Tipos de inmueble

/**
 * Coherencia entre el tipo de inmueble y los datos de casa (la base tiene el mismo CHECK):
 * una CASA exige habitaciones, baños y área construida; un LOTE o TERRENO no lleva datos de casa.
 */
export function validarDatosPorTipo(tipo: TipoPropiedad, casa: Partial<DatosCasa> | null | undefined): void {
  const tieneCasa = casa !== null && casa !== undefined && Object.values(casa).some((v) => v !== undefined && v !== null);
  if (tipo !== 'CASA') {
    if (tieneCasa) throw new BusinessRuleError(`Un inmueble de tipo ${tipo} no lleva datos de casa`);
    return;
  }
  const faltan = (['habitaciones', 'banos', 'areaConstruidaM2'] as const).filter(
    (campo) => casa?.[campo] === undefined || casa?.[campo] === null,
  );
  if (faltan.length > 0) {
    throw new BusinessRuleError('Una casa debe indicar habitaciones, baños y área construida', { faltan });
  }
}

/** Los filtros de casa solo tienen sentido buscando casas. */
export function validarFiltroCasa(f: { tipoPropiedad?: TipoPropiedad; habitacionesMin?: number; banosMin?: number }): void {
  if ((f.habitacionesMin !== undefined || f.banosMin !== undefined) && f.tipoPropiedad !== 'CASA') {
    throw new BusinessRuleError('habitacionesMin y banosMin solo se pueden usar con tipoPropiedad=CASA');
  }
}
