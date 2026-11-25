import { Module } from '@nestjs/common';
import { ListarAuditoriaUseCase } from './application/auditoria.use-cases';
import { ListarPublicacionesAdminUseCase, ModerarPublicacionUseCase } from './application/moderacion.use-cases';
import { CambiarEstadoUsuarioUseCase, ListarUsuariosAdminUseCase } from './application/usuarios-admin.use-cases';
import {
  AUDITORIA_REPOSITORY,
  PUBLICACION_ADMIN_REPOSITORY,
  USUARIO_ADMIN_REPOSITORY,
} from './domain/administracion.repository';
import { PrismaAuditoriaRepository } from './infrastructure/prisma-auditoria.repository';
import { PrismaPublicacionAdminRepository } from './infrastructure/prisma-publicacion-admin.repository';
import { PrismaUsuarioAdminRepository } from './infrastructure/prisma-usuario-admin.repository';
import {
  AdminAuditoriaController,
  AdminPublicacionesController,
  AdminUsuariosController,
} from './presentation/administracion.controller';

/** Panel administrativo: usuarios, moderación de publicaciones y auditoría (solo ADMIN). */
@Module({
  controllers: [AdminUsuariosController, AdminPublicacionesController, AdminAuditoriaController],
  providers: [
    ListarUsuariosAdminUseCase,
    CambiarEstadoUsuarioUseCase,
    ListarPublicacionesAdminUseCase,
    ModerarPublicacionUseCase,
    ListarAuditoriaUseCase,
    { provide: USUARIO_ADMIN_REPOSITORY, useClass: PrismaUsuarioAdminRepository },
    { provide: PUBLICACION_ADMIN_REPOSITORY, useClass: PrismaPublicacionAdminRepository },
    { provide: AUDITORIA_REPOSITORY, useClass: PrismaAuditoriaRepository },
  ],
})
export class AdministracionModule {}
