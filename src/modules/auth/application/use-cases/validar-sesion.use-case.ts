import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import { SessionValidator } from '../../../../shared/domain/session-validator.port';
import { TOKEN_SERVICE, TokenService } from '../../domain/ports';
import { SESION_REPOSITORY, SesionRepository } from '../../domain/sesion.repository';

/** UML: GestorUsuarios.validarSesion. Lo usan los guards en cada petición protegida. */
@Injectable()
export class ValidarSesionUseCase implements SessionValidator {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SESION_REPOSITORY) private readonly sesiones: SesionRepository,
  ) {}

  async validar(token: string): Promise<AuthUser> {
    const { idUsuario } = this.tokens.verificar(token);
    const sesion = await this.sesiones.buscarActivaPorHash(this.tokens.hash(token));

    if (!sesion || sesion.usuario.idUsuario !== idUsuario || sesion.usuario.estadoCuenta !== 'ACTIVA') {
      throw new UnauthorizedError('La sesión no es válida o ya expiró');
    }

    const { usuario } = sesion;
    return {
      idUsuario: usuario.idUsuario,
      idSesion: sesion.idSesion,
      nombreCompleto: usuario.nombreCompleto,
      correo: usuario.correo,
      rol: usuario.rol,
      idCliente: usuario.idCliente,
      idVendedor: usuario.idVendedor,
    };
  }
}
