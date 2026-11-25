import { Module } from '@nestjs/common';
import { ArchivosModule } from '../archivos/archivos.module';
import {
  EnviarDocumentoUseCase,
  ListarDocumentosAdminUseCase,
  ListarMisDocumentosUseCase,
  ObtenerArchivoDocumentoUseCase,
  RevisarDocumentoUseCase,
} from './application/verificacion.use-cases';
import { DOCUMENTO_REPOSITORY } from './domain/documento.repository';
import { PrismaDocumentoRepository } from './infrastructure/prisma-documento.repository';
import { AdminDocumentosController, VendedorDocumentosController } from './presentation/verificacion.controller';

@Module({
  imports: [ArchivosModule],
  controllers: [VendedorDocumentosController, AdminDocumentosController],
  providers: [
    EnviarDocumentoUseCase,
    ListarMisDocumentosUseCase,
    ListarDocumentosAdminUseCase,
    RevisarDocumentoUseCase,
    ObtenerArchivoDocumentoUseCase,
    { provide: DOCUMENTO_REPOSITORY, useClass: PrismaDocumentoRepository },
  ],
})
export class VerificacionModule {}
