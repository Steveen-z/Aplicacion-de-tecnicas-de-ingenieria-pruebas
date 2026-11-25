import { Module } from '@nestjs/common';
import {
  CrearComparacionUseCase,
  ListarComparacionesUseCase,
  ObtenerComparacionUseCase,
} from './application/comparaciones.use-cases';
import { COMPARACION_REPOSITORY } from './domain/comparacion.repository';
import { PrismaComparacionRepository } from './infrastructure/prisma-comparacion.repository';
import { ComparacionesController } from './presentation/comparaciones.controller';

@Module({
  controllers: [ComparacionesController],
  providers: [
    CrearComparacionUseCase,
    ObtenerComparacionUseCase,
    ListarComparacionesUseCase,
    { provide: COMPARACION_REPOSITORY, useClass: PrismaComparacionRepository },
  ],
})
export class ComparacionesModule {}
