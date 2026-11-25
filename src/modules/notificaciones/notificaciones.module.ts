import { Module } from '@nestjs/common';
import {
  ContarNoLeidasUseCase,
  ListarNotificacionesUseCase,
  MarcarLeidaUseCase,
  MarcarTodasLeidasUseCase,
} from './application/notificaciones.use-cases';
import { NOTIFICACION_REPOSITORY } from './domain/notificacion';
import { PrismaNotificacionRepository } from './infrastructure/prisma-notificacion.repository';
import { NotificacionesController } from './presentation/notificaciones.controller';

@Module({
  controllers: [NotificacionesController],
  providers: [
    ListarNotificacionesUseCase,
    ContarNoLeidasUseCase,
    MarcarLeidaUseCase,
    MarcarTodasLeidasUseCase,
    { provide: NOTIFICACION_REPOSITORY, useClass: PrismaNotificacionRepository },
  ],
})
export class NotificacionesModule {}
