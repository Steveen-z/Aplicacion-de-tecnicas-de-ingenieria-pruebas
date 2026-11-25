import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { NotFoundError } from '../../../shared/domain/errors';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import {
  Paginacion,
  USUARIO_ADMIN_REPOSITORY,
  UsuarioAdminRepository,
} from '../domain/administracion.repository';
import {
  EstadoCuenta,
  EstadoCuentaAdministrable,
  FiltroUsuariosAdmin,
  UsuarioAdminResumen,
  decidirCambioEstado,
} from '../domain/usuario-admin';

@Injectable()
export class ListarUsuariosAdminUseCase {
  constructor(@Inject(USUARIO_ADMIN_REPOSITORY) private readonly repo: UsuarioAdminRepository) {}

  async execute(input: FiltroUsuariosAdmin & Paginacion): Promise<Pagina<UsuarioAdminResumen>> {
    const { page, limit, ...filtro } = input;
    const { items, total } = await this.repo.listar(filtro, { page, limit });
    return crearPagina(items, total, page, limit);
  }
}

export interface ResultadoEstadoUsuario {
  idUsuario: number;
  estadoCuenta: EstadoCuentaAdministrable;
  estadoAnterior: EstadoCuenta;
  huboCambio: boolean;
  sesionesCerradas: number;
}

/** ADMIN bloquea o reactiva una cuenta. Bloquear cierra sus sesiones al instante. */
@Injectable()
export class CambiarEstadoUsuarioUseCase {
  private readonly logger = new Logger('Administracion');

  constructor(@Inject(USUARIO_ADMIN_REPOSITORY) private readonly repo: UsuarioAdminRepository) {}

  async execute(input: {
    actor: AuthUser;
    idUsuario: number;
    estado: EstadoCuentaAdministrable;
    motivo?: string;
  }): Promise<ResultadoEstadoUsuario> {
    const objetivo = await this.repo.buscarPorId(input.idUsuario);
    if (!objetivo) throw new NotFoundError('El usuario no existe');
    const { motivo } = decidirCambioEstado({
      idActor: input.actor.idUsuario,
      objetivo,
      nuevoEstado: input.estado,
      motivo: input.motivo,
    });

    const r = await this.repo.cambiarEstado(input.idUsuario, input.estado, ({ estadoAnterior, sesionesCerradas }) => ({
      idActor: input.actor.idUsuario,
      accion: input.estado === 'BLOQUEADA' ? 'USUARIO_BLOQUEADO' : 'USUARIO_ACTIVADO',
      entidad: 'USUARIO',
      idEntidad: input.idUsuario,
      detalle: { motivo, estadoAnterior, estadoNuevo: input.estado, sesionesCerradas },
    }));
    if (!r) throw new NotFoundError('El usuario no existe');

    this.logger.warn(
      JSON.stringify({
        evento: input.estado === 'BLOQUEADA' ? 'usuario_bloqueado' : 'usuario_activado',
        actor: input.actor.idUsuario,
        objetivo: input.idUsuario,
        motivo,
        huboCambio: r.huboCambio,
      }),
    );
    return { idUsuario: input.idUsuario, estadoCuenta: input.estado, ...r };
  }
}
