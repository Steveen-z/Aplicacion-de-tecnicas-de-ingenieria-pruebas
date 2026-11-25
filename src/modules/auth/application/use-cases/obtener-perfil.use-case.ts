import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import { Usuario } from '../../domain/usuario';
import { USUARIO_REPOSITORY, UsuarioRepository } from '../../domain/usuario.repository';

@Injectable()
export class ObtenerPerfilUseCase {
  constructor(@Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository) {}

  async execute(idUsuario: number): Promise<Usuario> {
    const usuario = await this.usuarios.buscarPorId(idUsuario);
    if (!usuario) throw new UnauthorizedError('La sesión ya no es válida');
    return usuario;
  }
}
