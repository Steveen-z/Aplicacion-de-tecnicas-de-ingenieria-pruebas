import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import { CambiosPerfil, validarCambioPerfil } from '../../domain/perfil';
import { Usuario } from '../../domain/usuario';
import { USUARIO_REPOSITORY, UsuarioRepository } from '../../domain/usuario.repository';

/** Editar el perfil propio (nombre y teléfono). El id sale de la sesión, nunca del cuerpo. */
@Injectable()
export class ActualizarPerfilUseCase {
  constructor(@Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository) {}

  async execute(input: { user: AuthUser } & CambiosPerfil): Promise<Usuario> {
    const actual = await this.usuarios.buscarPorId(input.user.idUsuario);
    if (!actual) throw new UnauthorizedError('La sesión ya no es válida');
    const datos = validarCambioPerfil(actual, {
      nombreCompleto: input.nombreCompleto,
      telefono: input.telefono,
    });
    return this.usuarios.actualizarPerfil(actual.idUsuario, datos);
  }
}
