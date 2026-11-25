import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { SESION_REPOSITORY, SesionRepository } from '../../domain/sesion.repository';
import { EmitirSesionService, SesionEmitida } from '../services/emitir-sesion.service';

/** Emite un token nuevo y finaliza el anterior (UML: Sesion.renovarSesion). */
@Injectable()
export class RenovarSesionUseCase {
  constructor(
    @Inject(SESION_REPOSITORY) private readonly sesiones: SesionRepository,
    private readonly emitirSesion: EmitirSesionService,
  ) {}

  async execute(actual: AuthUser): Promise<SesionEmitida> {
    const nueva = await this.emitirSesion.emitir(actual.idUsuario);
    await this.sesiones.finalizar(actual.idSesion);
    return nueva;
  }
}
