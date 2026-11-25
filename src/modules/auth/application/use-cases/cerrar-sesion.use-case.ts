import { Inject, Injectable } from '@nestjs/common';
import { SESION_REPOSITORY, SesionRepository } from '../../domain/sesion.repository';

@Injectable()
export class CerrarSesionUseCase {
  constructor(@Inject(SESION_REPOSITORY) private readonly sesiones: SesionRepository) {}

  async execute(idSesion: number): Promise<void> {
    await this.sesiones.finalizar(idSesion);
  }
}
