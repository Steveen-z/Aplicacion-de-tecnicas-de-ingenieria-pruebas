import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { EstadoPublicacion } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { AccionEstado, calcularNuevoEstado } from '../domain/publicacion.rules';
import { cargarPublicacionPropia } from './acceso';

/** P09 (acciones pausar, reactivar, marcar como vendida o rentada). */
@Injectable()
export class CambiarEstadoUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: {
    user: AuthUser;
    idPublicacion: number;
    accion: AccionEstado;
  }): Promise<{ idPublicacion: number; estado: EstadoPublicacion }> {
    const publicacion = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);

    const nuevoEstado = calcularNuevoEstado(input.accion, {
      estado: publicacion.estado,
      tipoOperacion: publicacion.tipoOperacion,
      totalFotografias: publicacion.fotografias.length,
    });

    await this.repo.cambiarEstado(publicacion.idPublicacion, nuevoEstado);
    return { idPublicacion: publicacion.idPublicacion, estado: nuevoEstado };
  }
}
