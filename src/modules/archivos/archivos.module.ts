import { Module } from '@nestjs/common';
import { ArchivosCoreModule } from './archivos-core.module';
import { ArchivosController } from './presentation/archivos.controller';

@Module({
  imports: [ArchivosCoreModule],
  controllers: [ArchivosController],
  exports: [ArchivosCoreModule],
})
export class ArchivosModule {}
