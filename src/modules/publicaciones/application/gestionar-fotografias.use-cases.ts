import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { ResolverArchivosService } from '../../archivos/application/resolver-archivos.service';
import { Fotografia, FotografiaEntrada } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { MAX_FOTOGRAFIAS, puedeEditarse } from '../domain/publicacion.rules';
import { cargarPublicacionPropia } from './acceso';

@Injectable()
export class AgregarFotografiasUseCase {
  constructor(
    @Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository,
    private readonly archivos: ResolverArchivosService,
  ) {}

  async execute(input: { user: AuthUser; idPublicacion: number; fotografias: FotografiaEntrada[] }): Promise<Fotografia[]> {
    const publicacion = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);
    if (!puedeEditarse(publicacion.estado)) {
      throw new BusinessRuleError('Una publicación vendida, rentada o rechazada ya no se puede editar');
    }
    if (publicacion.fotografias.length + input.fotografias.length > MAX_FOTOGRAFIAS) {
      throw new BusinessRuleError(`Solo se permiten hasta ${MAX_FOTOGRAFIAS} fotografías por publicación`);
    }
    const rutas = await this.archivos.resolverImagenes(input.user.idUsuario, input.fotografias.map((f) => f.urlImagen));
    return this.repo.agregarFotografias(
      input.idPublicacion,
      input.fotografias.map((f, i) => ({ ...f, ruta: rutas[i].ruta })),
    );
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
