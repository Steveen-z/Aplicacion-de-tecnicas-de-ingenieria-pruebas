import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError } from '../../../../shared/domain/errors';
import {
  esTelefonoValido,
  normalizarCorreo,
  normalizarTelefono,
} from '../../../../shared/domain/validators';
import { PASSWORD_HASHER, PasswordHasher } from '../../domain/ports';
import { Usuario } from '../../domain/usuario';
import { USUARIO_REPOSITORY, UsuarioRepository } from '../../domain/usuario.repository';
import { EmitirSesionService, SesionEmitida } from '../services/emitir-sesion.service';

export interface RegistrarClienteInput {
  nombreCompleto: string;
  correo: string;
  password: string;
  telefono?: string;
}

export interface RegistroResultado extends SesionEmitida {
  usuario: Usuario;
}

/** P02 - Registrar cuenta de cliente. */
@Injectable()
export class RegistrarClienteUseCase {
  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly emitirSesion: EmitirSesionService,
  ) {}

  async execute(input: RegistrarClienteInput): Promise<RegistroResultado> {
    const correo = normalizarCorreo(input.correo);
    const telefono = input.telefono ? normalizarTelefono(input.telefono) : null;

    if (telefono !== null && !esTelefonoValido(telefono)) {
      throw new BusinessRuleError('El teléfono no tiene un formato válido');
    }
    if (await this.usuarios.existePorCorreo(correo)) {
      throw new ConflictError('El correo ya está registrado');
    }

    const usuario = await this.usuarios.crearCliente({
      nombreCompleto: input.nombreCompleto.trim(),
      correo,
      passwordHash: await this.hasher.hash(input.password),
      telefono,
    });

    return { usuario, ...(await this.emitirSesion.emitir(usuario.idUsuario)) };
  }
}
