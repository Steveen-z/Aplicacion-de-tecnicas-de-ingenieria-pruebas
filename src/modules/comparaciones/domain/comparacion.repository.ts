import { ComparacionGuardada, TerrenoComparable } from './comparacion';

export const COMPARACION_REPOSITORY = Symbol('COMPARACION_REPOSITORY');

export interface ComparacionRepository {
  /** Devuelve los terrenos que existen, en el mismo orden de los ids recibidos. */
  obtenerTerrenos(idsPublicaciones: number[]): Promise<TerrenoComparable[]>;
  crear(idCliente: number, idsPublicaciones: number[]): Promise<ComparacionGuardada>;
  buscarPorId(idComparacion: number, idCliente: number): Promise<ComparacionGuardada | null>;
  listar(idCliente: number): Promise<ComparacionGuardada[]>;
}
