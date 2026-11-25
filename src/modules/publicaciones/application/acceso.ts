import { AuthUser } from '../../../shared/domain/auth-user';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { Publicacion } from '../domain/publicacion';
import { PublicacionRepository } from '../domain/publicacion.repository';

/** El propietario de la publicación o un administrador ven todo (incluso si no está activa). */
export function esPropietarioOAdmin(user: AuthUser | undefined, publicacion: Publicacion): boolean {
  if (!user) return false;
  return user.rol === 'ADMIN' || (user.idVendedor !== null && user.idVendedor === publicacion.idVendedor);
}

/** Carga una publicación visible para quien consulta; si no lo es responde 404. */
export async function cargarPublicacionVisible(
  repo: PublicacionRepository,
  idPublicacion: number,
  user: AuthUser | undefined,
): Promise<{ publicacion: Publicacion; privilegiado: boolean }> {
  const publicacion = await repo.buscarPorId(idPublicacion);
  if (!publicacion) throw new NotFoundError('La publicación no existe');

  const privilegiado = esPropietarioOAdmin(user, publicacion);
  if (publicacion.estado !== 'ACTIVA' && !privilegiado) {
    throw new NotFoundError('La publicación no está disponible');
  }
  return { publicacion, privilegiado };
}

/** Carga una publicación y exige que pertenezca al vendedor autenticado. */
export async function cargarPublicacionPropia(
  repo: PublicacionRepository,
  idPublicacion: number,
  user: AuthUser,
): Promise<Publicacion> {
  if (user.idVendedor === null) {
    throw new ForbiddenError('Necesitas una cuenta de vendedor para gestionar publicaciones');
  }
  const publicacion = await repo.buscarPorId(idPublicacion);
  if (!publicacion) throw new NotFoundError('La publicación no existe');
  if (publicacion.idVendedor !== user.idVendedor) {
    throw new ForbiddenError('Solo el propietario puede modificar esta publicación');
  }
  return publicacion;
}
