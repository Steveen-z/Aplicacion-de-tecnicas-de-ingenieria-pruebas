import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError } from '../../../../shared/domain/errors';
import {
  esDuiValido,
  esTelefonoValido,
  normalizarCorreo,
  normalizarTelefono,
} from '../../../../shared/domain/validators';
import { PASSWORD_HASHER, PasswordHasher } from '../../domain/ports';
import { USUARIO_REPOSITORY, UsuarioRepository } from '../../domain/usuario.repository';
import { EmitirSesionService } from '../services/emitir-sesion.service';
import { RegistroResultado } from './registrar-cliente.use-case';

export interface RegistrarVendedorInput {
  nombreCompleto: string;
  correo: string;
  password: string;
  telefono: string;
  dui: string;
  numeroWhatsapp?: string;
}

/** P01 - Registrar cuenta de vendedor. */
@Injectable()
export class RegistrarVendedorUseCase {
  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly emitirSesion: EmitirSesionService,
  ) {}

  async execute(input: RegistrarVendedorInput): Promise<RegistroResultado> {
    const correo = normalizarCorreo(input.correo);
    const telefono = normalizarTelefono(input.telefono);
    const whatsapp = input.numeroWhatsapp ? normalizarTelefono(input.numeroWhatsapp) : null;

    const errores: string[] = [];
    if (!esTelefonoValido(telefono)) errores.push('El teléfono no tiene un formato válido');
    if (whatsapp !== null && !esTelefonoValido(whatsapp)) {
      errores.push('El número de WhatsApp no tiene un formato válido');
    }
    if (!esDuiValido(input.dui)) errores.push('El DUI debe tener el formato 00000000-0');
    if (errores.length > 0) {
      throw new BusinessRuleError('Los datos del vendedor no son válidos', errores);
    }

    if (await this.usuarios.existePorCorreo(correo)) {
      throw new ConflictError('El correo ya está registrado');
    }
    if (await this.usuarios.existeDui(input.dui)) {
      throw new ConflictError('El DUI ya está registrado');
    }

    const usuario = await this.usuarios.crearVendedor({
      nombreCompleto: input.nombreCompleto.trim(),
      correo,
      passwordHash: await this.hasher.hash(input.password),
      telefono,
      dui: input.dui,
      numeroWhatsapp: whatsapp ?? telefono,
    });

    return { usuario, ...(await this.emitirSesion.emitir(usuario.idUsuario)) };
  }
}
