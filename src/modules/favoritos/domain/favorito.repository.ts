import { FavoritoVista, PublicacionParaFavorito } from './favorito';

export const FAVORITO_REPOSITORY = Symbol('FAVORITO_REPOSITORY');

export interface FavoritoRepository {
  obtenerPublicacion(idPublicacion: number): Promise<PublicacionParaFavorito | null>;
  existe(idCliente: number, idPublicacion: number): Promise<boolean>;
  /** Idempotente: si ya existe (doble clic / carrera) no lanza error. */
  crear(idCliente: number, idPublicacion: number, precioAlGuardar: number): Promise<void>;
  /** false si no existía. */
  eliminar(idCliente: number, idPublicacion: number): Promise<boolean>;
  listar(idCliente: number): Promise<FavoritoVista[]>;
}
