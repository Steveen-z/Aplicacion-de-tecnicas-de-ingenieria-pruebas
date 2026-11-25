import { Module } from '@nestjs/common';
import { ListarSolicitudesUseCase } from './application/listar-solicitudes.use-case';
import { SolicitarCambioRolUseCase } from './application/solicitar-cambio-rol.use-case';
import { CAMBIO_ROL_REPOSITORY } from './domain/cambio-rol.repository';
import { PrismaCambioRolRepository } from './infrastructure/prisma-cambio-rol.repository';
import { CambioRolController } from './presentation/cambio-rol.controller';

@Module({
  controllers: [CambioRolController],
  providers: [
    SolicitarCambioRolUseCase,
    ListarSolicitudesUseCase,
    { provide: CAMBIO_ROL_REPOSITORY, useClass: PrismaCambioRolRepository },
  ],
})
export class CambioRolModule {}
