import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import { EstadoPublicacion } from '../../publicaciones/domain/publicacion';
import {
  FiltroPublicacionesAdmin,
  PUBLICACION_ADMIN_REPOSITORY,
  Paginacion,
  PublicacionAdminRepository,
  PublicacionAdminResumen,
} from '../domain/administracion.repository';
import { AccionModeracion, avisoModeracion, calcularModeracion } from '../domain/moderacion';

@Injectable()
export class ListarPublicacionesAdminUseCase {
  constructor(@Inject(PUBLICACION_ADMIN_REPOSITORY) private readonly repo: PublicacionAdminRepository) {}

  async execute(input: FiltroPublicacionesAdmin & Paginacion): Promise<Pagina<PublicacionAdminResumen>> {
    const { page, limit, ...filtro } = input;
    const { items, total } = await this.repo.listar(filtro, { page, limit });
    return crearPagina(items, total, page, limit);
  }
}

/** ADMIN rechaza (con motivo) o restaura una publicación; el vendedor recibe un aviso. */
@Injectable()
export class ModerarPublicacionUseCase {
  private readonly logger = new Logger('Administracion');

  constructor(@Inject(PUBLICACION_ADMIN_REPOSITORY) private readonly repo: PublicacionAdminRepository) {}

  async execute(input: {
    actor: AuthUser;
    idPublicacion: number;
    accion: AccionModeracion;
    motivo?: string;
  }): Promise<{ idPublicacion: number; estado: EstadoPublicacion; estadoAnterior: EstadoPublicacion; motivo: string | null }> {
    const pub = await this.repo.buscarParaModerar(input.idPublicacion);
    if (!pub) throw new NotFoundError('La publicación no existe');
    const decision = calcularModeracion(input.accion, pub.estado, input.motivo);

    const resultado = await this.repo.moderar(
      pub.idPublicacion,
      decision,
      { idUsuario: pub.idUsuarioVendedor, ...avisoModeracion(input.accion, pub.titulo, decision.motivo) },
      {
        idActor: input.actor.idUsuario,
        accion: input.accion === 'RECHAZAR' ? 'PUBLICACION_RECHAZADA' : 'PUBLICACION_RESTAURADA',
        entidad: 'PUBLICACION',
        idEntidad: pub.idPublicacion,
        detalle: { motivo: decision.motivo, estadoAnterior: pub.estado, estadoNuevo: decision.hacia },
      },
    );
    if (resultado === 'NO_EXISTE') throw new NotFoundError('La publicación no existe');
    if (resultado === 'CONFLICTO') {
      throw new ConflictError('La publicación cambió de estado mientras la moderabas; recarga e inténtalo de nuevo');
    }

    this.logger.warn(
      JSON.stringify({
        evento: input.accion === 'RECHAZAR' ? 'publicacion_rechazada' : 'publicacion_restaurada',
        actor: input.actor.idUsuario,
        publicacion: pub.idPublicacion,
        motivo: decision.motivo,
      }),
    );
    return { idPublicacion: pub.idPublicacion, estado: decision.hacia, estadoAnterior: pub.estado, motivo: decision.motivo };
  }
}
