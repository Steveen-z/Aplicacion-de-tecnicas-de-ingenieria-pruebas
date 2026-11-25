import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { Fotografia, NuevaFotografia } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { MAX_FOTOGRAFIAS, puedeEditarse } from '../domain/publicacion.rules';
import { cargarPublicacionPropia } from './acceso';

@Injectable()
export class AgregarFotografiasUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: { user: AuthUser; idPublicacion: number; fotografias: NuevaFotografia[] }): Promise<Fotografia[]> {
    const publicacion = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);
    if (!puedeEditarse(publicacion.estado)) {
      throw new BusinessRuleError('Una publicación vendida, rentada o rechazada ya no se puede editar');
    }
    if (publicacion.fotografias.length + input.fotografias.length > MAX_FOTOGRAFIAS) {
      throw new BusinessRuleError(`Solo se permiten hasta ${MAX_FOTOGRAFIAS} fotografías por publicación`);
    }
    return this.repo.agregarFotografias(input.idPublicacion, input.fotografias);
  }
}

@Injectable()
export class EliminarFotografiaUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: { user: AuthUser; idPublicacion: number; idFotografia: number }): Promise<void> {
    const publicacion = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);
    if (!puedeEditarse(publicacion.estado)) {
      throw new BusinessRuleError('Una publicación vendida, rentada o rechazada ya no se puede editar');
    }
    // Cardinalidad mínima 1..* del UML: una publicación activa no puede quedarse sin fotos.
    if (publicacion.estado === 'ACTIVA' && publicacion.fotografias.length <= 1) {
      throw new BusinessRuleError('Una publicación activa debe conservar al menos una fotografía');
    }
    const eliminada = await this.repo.eliminarFotografia(input.idPublicacion, input.idFotografia);
    if (!eliminada) throw new NotFoundError('La fotografía no existe en esta publicación');
  }
}

@Injectable()
export class DefinirPortadaUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: { user: AuthUser; idPublicacion: number; idFotografia: number }): Promise<void> {
    await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);
    const definida = await this.repo.definirPortada(input.idPublicacion, input.idFotografia);
    if (!definida) throw new NotFoundError('La fotografía no existe en esta publicación');
  }
}
