import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { FavoritoVista } from '../domain/favorito';
import { FAVORITO_REPOSITORY, FavoritoRepository } from '../domain/favorito.repository';

function exigirCliente(user: AuthUser): number {
  if (user.idCliente === null) {
    throw new ForbiddenError('Tu cuenta no tiene perfil de cliente');
  }
  return user.idCliente;
}

/** P10 - Guardar o quitar una propiedad de favoritos (UML: GestorFavoritos / Cliente.agregarFavorito). */
@Injectable()
export class AlternarFavoritoUseCase {
  constructor(@Inject(FAVORITO_REPOSITORY) private readonly repo: FavoritoRepository) {}

  async execute(input: {
    user: AuthUser;
    idPublicacion: number;
  }): Promise<{ agregado: boolean; precioAlGuardar: number | null }> {
    const idCliente = exigirCliente(input.user);

    const publicacion = await this.repo.obtenerPublicacion(input.idPublicacion);
    if (!publicacion) throw new NotFoundError('La publicación no existe');

    // Si ya estaba en favoritos, se elimina (aunque la publicación ya no esté activa).
    if (await this.repo.existe(idCliente, input.idPublicacion)) {
      await this.repo.eliminar(idCliente, input.idPublicacion);
      return { agregado: false, precioAlGuardar: null };
    }

    if (publicacion.estado !== 'ACTIVA') {
      throw new BusinessRuleError('Solo se pueden guardar publicaciones activas');
    }
    // El precio de referencia permite detectar luego las bajas de precio.
    await this.repo.crear(idCliente, input.idPublicacion, publicacion.precio);
    return { agregado: true, precioAlGuardar: publicacion.precio };
  }
}

@Injectable()
export class EliminarFavoritoUseCase {
  constructor(@Inject(FAVORITO_REPOSITORY) private readonly repo: FavoritoRepository) {}

  async execute(input: { user: AuthUser; idPublicacion: number }): Promise<void> {
    const eliminado = await this.repo.eliminar(exigirCliente(input.user), input.idPublicacion);
    if (!eliminado) throw new NotFoundError('La publicación no está en tus favoritos');
  }
}

@Injectable()
export class ListarFavoritosUseCase {
  constructor(@Inject(FAVORITO_REPOSITORY) private readonly repo: FavoritoRepository) {}

  execute(user: AuthUser): Promise<FavoritoVista[]> {
    return this.repo.listar(exigirCliente(user));
  }
}
