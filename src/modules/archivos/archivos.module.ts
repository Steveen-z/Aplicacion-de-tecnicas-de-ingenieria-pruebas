import { Module } from '@nestjs/common';
import { FILE_STORAGE } from '../../shared/domain/file-storage.port';
import { SubirArchivoUseCase } from './application/subir-archivo.use-case';
import { LocalFileStorage } from './infrastructure/local-file-storage';
import { ArchivosController } from './presentation/archivos.controller';

@Module({
  controllers: [ArchivosController],
  providers: [SubirArchivoUseCase, { provide: FILE_STORAGE, useClass: LocalFileStorage }],
  exports: [FILE_STORAGE],
})
export class ArchivosModule {}
