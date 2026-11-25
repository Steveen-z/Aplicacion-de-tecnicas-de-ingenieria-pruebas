import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/domain/errors';
import { normalizarTelefono } from '../../../shared/domain/validators';
import { CAMBIO_ROL_REPOSITORY, CambioRolRepository } from '../domain/cambio-rol.repository';
import { evaluarRequisitosVendedor } from '../domain/solicitud-cambio-rol';

export interface SolicitarCambioRolInput {
  idUsuario: number;
  dui?: string;
  numeroWhatsapp?: string;
  /** Permite completar el teléfono del perfil en la misma solicitud. */
  telefono?: string;
}

/** P03 - Solicitar cambio de rol a vendedor. */
@Injectable()
export class SolicitarCambioRolUseCase {
  constructor(@Inject(CAMBIO_ROL_REPOSITORY) private readonly repo: CambioRolRepository) {}

  async execute(input: SolicitarCambioRolInput): Promise<{ rol: 'VENDEDOR'; idVendedor: number; idSolicitud: number }> {
    const perfil = await this.repo.obtenerPerfil(input.idUsuario);
    if (!perfil) throw new UnauthorizedError('La sesión ya no es válida');
    if (perfil.rol === 'VENDEDOR') throw new ConflictError('Tu cuenta ya tiene el rol de vendedor');
    if (perfil.rol === 'ADMIN') throw new ForbiddenError('Una cuenta de administrador no puede ser vendedor');

    const telefonoNuevo = input.telefono?.trim() ? normalizarTelefono(input.telefono) : null;
    const telefono = telefonoNuevo ?? (perfil.telefono ? normalizarTelefono(perfil.telefono) : null);
    const datos = {
      dui: input.dui?.trim() ?? '',
      numeroWhatsapp: input.numeroWhatsapp?.trim() ? normalizarTelefono(input.numeroWhatsapp) : telefono,
      telefono: telefonoNuevo,
    };

    const pendientes = evaluarRequisitosVendedor({ nombreCompleto: perfil.nombreCompleto, telefono }, datos);
    if (pendientes.length === 0 && (await this.repo.duiEnUso(datos.dui))) {
      pendientes.push('El DUI ya está registrado en otra cuenta');
    }

    if (pendientes.length > 0) {
      await this.repo.registrarRechazo(perfil.idUsuario, pendientes);
      throw new BusinessRuleError('Aún no cumples los requisitos para ser vendedor', {
        requisitosPendientes: pendientes,
      });
    }

    const { idSolicitud, idVendedor } = await this.repo.aprobarCambio(perfil.idUsuario, datos);
    return { rol: 'VENDEDOR', idVendedor, idSolicitud };
  }
}
