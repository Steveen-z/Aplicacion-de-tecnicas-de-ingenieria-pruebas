import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { ForbiddenError } from '../../../shared/domain/errors';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import { EstadoPublicacion, PublicacionResumen } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';

/** Listado de las publicaciones del vendedor autenticado (cualquier estado). */
@Injectable()
export class ListarMisPublicacionesUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: {
    user: AuthUser;
    estado?: EstadoPublicacion;
    page: number;
    limit: number;
  }): Promise<Pagina<PublicacionResumen>> {
    if (input.user.idVendedor === null) {
      throw new ForbiddenError('Necesitas una cuenta de vendedor');
    }
    const { items, total } = await this.repo.listarDeVendedor(input.user.idVendedor, input.estado, {
      page: input.page,
      limit: input.limit,
    });
    return crearPagina(items, total, input.page, input.limit);
  }
}
