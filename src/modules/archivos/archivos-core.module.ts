import { Module } from '@nestjs/common';
import { FILE_STORAGE } from '../../shared/domain/file-storage.port';
import { LimpiarArchivosUseCase } from './application/limpiar-archivos.use-case';
import { ResolverArchivosService } from './application/resolver-archivos.service';
import { SubirArchivoUseCase } from './application/subir-archivo.use-case';
import { ARCHIVO_REPOSITORY } from './domain/archivo.repository';
import { LocalFileStorage } from './infrastructure/local-file-storage';
import { PrismaArchivoRepository } from './infrastructure/prisma-archivo.repository';

/** Servicios de archivos sin HTTP: los usa la API (ArchivosModule) y el CLI de limpieza. */
@Module({
  providers: [
    SubirArchivoUseCase,
    ResolverArchivosService,
    LimpiarArchivosUseCase,
    { provide: FILE_STORAGE, useClass: LocalFileStorage },
    { provide: ARCHIVO_REPOSITORY, useClass: PrismaArchivoRepository },
  ],
  exports: [FILE_STORAGE, SubirArchivoUseCase, ResolverArchivosService, LimpiarArchivosUseCase],
})
export class ArchivosCoreModule {}
