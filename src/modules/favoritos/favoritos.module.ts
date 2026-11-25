import { Module } from '@nestjs/common';
import {
  AlternarFavoritoUseCase,
  EliminarFavoritoUseCase,
  ListarFavoritosUseCase,
} from './application/favoritos.use-cases';
import { FAVORITO_REPOSITORY } from './domain/favorito.repository';
import { PrismaFavoritoRepository } from './infrastructure/prisma-favorito.repository';
import { FavoritosController } from './presentation/favoritos.controller';

@Module({
  controllers: [FavoritosController],
  providers: [
    AlternarFavoritoUseCase,
    EliminarFavoritoUseCase,
    ListarFavoritosUseCase,
    { provide: FAVORITO_REPOSITORY, useClass: PrismaFavoritoRepository },
  ],
})
export class FavoritosModule {}
