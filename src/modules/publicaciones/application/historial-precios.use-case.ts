import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { CambioPrecio } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { cargarPublicacionVisible } from './acceso';

@Injectable()
export class HistorialPreciosUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(idPublicacion: number, user?: AuthUser): Promise<CambioPrecio[]> {
    await cargarPublicacionVisible(this.repo, idPublicacion, user);
    return this.repo.listarHistorialPrecios(idPublicacion);
  }
}
