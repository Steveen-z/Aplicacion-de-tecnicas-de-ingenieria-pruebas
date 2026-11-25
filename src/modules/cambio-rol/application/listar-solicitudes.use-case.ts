import { Inject, Injectable } from '@nestjs/common';
import { CAMBIO_ROL_REPOSITORY, CambioRolRepository } from '../domain/cambio-rol.repository';
import { SolicitudCambioRol } from '../domain/solicitud-cambio-rol';

@Injectable()
export class ListarSolicitudesUseCase {
  constructor(@Inject(CAMBIO_ROL_REPOSITORY) private readonly repo: CambioRolRepository) {}

  execute(idUsuario: number): Promise<SolicitudCambioRol[]> {
    return this.repo.listarSolicitudes(idUsuario);
  }
}
