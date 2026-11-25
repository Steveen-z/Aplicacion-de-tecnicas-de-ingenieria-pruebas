import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, UnauthorizedError } from '../../../../shared/domain/errors';
import { normalizarCorreo } from '../../../../shared/domain/validators';
import { PASSWORD_HASHER, PasswordHasher } from '../../domain/ports';
import { USUARIO_REPOSITORY, UsuarioRepository } from '../../domain/usuario.repository';
import { EmitirSesionService } from '../services/emitir-sesion.service';
import { RegistroResultado } from './registrar-cliente.use-case';

/** Iniciar sesión (UML: Usuario.iniciarSesion / GestorUsuarios.autenticar). */
@Injectable()
export class IniciarSesionUseCase {
  private hashFalso?: Promise<string>;

  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly emitirSesion: EmitirSesionService,
  ) {}

  async execute(input: { correo: string; password: string }): Promise<RegistroResultado> {
    const usuario = await this.usuarios.buscarConCredencialesPorCorreo(normalizarCorreo(input.correo));

    // Se compara siempre contra un hash para que el tiempo de respuesta no revele si el correo existe.
    const hashAComparar = usuario?.passwordHash ?? (await this.obtenerHashFalso());
    const coincide = await this.hasher.comparar(input.password, hashAComparar);

    if (!usuario || !coincide) {
      throw new UnauthorizedError('Correo o contraseña incorrectos');
    }
    if (usuario.estadoCuenta !== 'ACTIVA') {
      throw new ForbiddenError('Tu cuenta está inactiva o bloqueada. Contacta a soporte.');
    }

    const { passwordHash: _omitido, ...publico } = usuario;
    return { usuario: publico, ...(await this.emitirSesion.emitir(usuario.idUsuario)) };
  }

  private obtenerHashFalso(): Promise<string> {
    this.hashFalso ??= this.hasher.hash(randomUUID());
    return this.hashFalso;
  }
}
