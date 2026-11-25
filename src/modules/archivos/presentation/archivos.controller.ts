import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/security/roles.guard';
import { SubirArchivoUseCase } from '../application/subir-archivo.use-case';

const MB = 1024 * 1024;
const cuerpoMultipart = {
  schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] },
};

@ApiTags('Archivos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('archivos')
export class ArchivosController {
  constructor(private readonly subirArchivo: SubirArchivoUseCase) {}

  /**
   * Sube una imagen (JPG, PNG o WEBP, máx. 5 MB) en el campo multipart "archivo".
   * Devuelve la `url` que luego se envía en `fotografias[].urlImagen` al publicar.
   */
  @Post('imagenes')
  @Roles('VENDEDOR', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiBody(cuerpoMultipart)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 5 * MB, files: 1 } }))
  subirImagen(@UploadedFile() archivo: Express.Multer.File | undefined) {
    return this.subirArchivo.execute({ contenido: archivo?.buffer, categoria: 'IMAGEN' });
  }

  /**
   * Sube un documento de verificación (PDF, JPG o PNG, máx. 8 MB). Es privado: devuelve solo
   * la `ruta`, que se envía en POST /vendedores/me/documentos.
   */
  @Post('documentos')
  @Roles('VENDEDOR')
  @ApiConsumes('multipart/form-data')
  @ApiBody(cuerpoMultipart)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 8 * MB, files: 1 } }))
  subirDocumento(@UploadedFile() archivo: Express.Multer.File | undefined) {
    return this.subirArchivo.execute({ contenido: archivo?.buffer, categoria: 'DOCUMENTO' });
  }
}
