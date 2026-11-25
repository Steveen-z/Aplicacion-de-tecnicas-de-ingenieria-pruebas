import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/errors';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import {
  NOTIFICACION_REPOSITORY,
  Notificacion,
  NotificacionRepository,
} from '../domain/notificacion';

@Injectable()
export class ListarNotificacionesUseCase {
  constructor(@Inject(NOTIFICACION_REPOSITORY) private readonly repo: NotificacionRepository) {}

  async execute(input: {
    idUsuario: number;
    soloNoLeidas: boolean;
    page: number;
    limit: number;
  }): Promise<Pagina<Notificacion> & { noLeidas: number }> {
    const [{ items, total }, noLeidas] = await Promise.all([
      this.repo.listar(input.idUsuario, input),
      this.repo.contarNoLeidas(input.idUsuario),
    ]);
    return { ...crearPagina(items, total, input.page, input.limit), noLeidas };
  }
}

@Injectable()
export class ContarNoLeidasUseCase {
  constructor(@Inject(NOTIFICACION_REPOSITORY) private readonly repo: NotificacionRepository) {}

  async execute(idUsuario: number): Promise<{ noLeidas: number }> {
    return { noLeidas: await this.repo.contarNoLeidas(idUsuario) };
  }
}

/** UML: Notificacion.marcarComoLeido. */
@Injectable()
export class MarcarLeidaUseCase {
  constructor(@Inject(NOTIFICACION_REPOSITORY) private readonly repo: NotificacionRepository) {}

  async execute(idUsuario: number, idNotificacion: number): Promise<void> {
    if (!(await this.repo.marcarLeida(idUsuario, idNotificacion))) {
      throw new NotFoundError('La notificación no existe');
    }
  }
}

@Injectable()
export class MarcarTodasLeidasUseCase {
  constructor(@Inject(NOTIFICACION_REPOSITORY) private readonly repo: NotificacionRepository) {}

  async execute(idUsuario: number): Promise<{ marcadas: number }> {
    return { marcadas: await this.repo.marcarTodasLeidas(idUsuario) };
  }
}
