import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Response } from 'express';
import { AuthUser } from '../../../shared/domain/auth-user';
import { PaginationQueryDto } from '../../../shared/infrastructure/http/pagination-query.dto';
import { ParseIdPipe } from '../../../shared/infrastructure/http/parse-id.pipe';
import { CurrentUser, Roles } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/security/roles.guard';
import { MIME_POR_EXTENSION, ExtensionArchivo } from '../../archivos/domain/tipo-archivo';
import {
  EnviarDocumentoUseCase,
  ListarDocumentosAdminUseCase,
  ListarMisDocumentosUseCase,
  ObtenerArchivoDocumentoUseCase,
  RevisarDocumentoUseCase,
} from '../application/verificacion.use-cases';
import { TIPOS_DOCUMENTO } from '../domain/documento';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EnviarDocumentoDto {
  @IsIn(TIPOS_DOCUMENTO)
  tipoDocumento!: (typeof TIPOS_DOCUMENTO)[number];

  /** La `ruta` devuelta por POST /archivos/documentos. */
  @Transform(recortar)
  @IsString()
  @MaxLength(200)
  @Matches(/^documentos\/[0-9a-f-]{36}\.(jpg|png|pdf)$/, { message: 'rutaDocumento no es una ruta de documento válida' })
  rutaDocumento!: string;
}

export class RevisarDocumentoDto {
  @IsIn(['APROBADO', 'RECHAZADO'])
  estado!: 'APROBADO' | 'RECHAZADO';

  /** Obligatoria al rechazar. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}

export class DocumentosAdminQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['PENDIENTE', 'APROBADO', 'RECHAZADO'])
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' = 'PENDIENTE';
}

@ApiTags('Verificación de vendedor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VENDEDOR')
@Controller('vendedores/me')
export class VendedorDocumentosController {
  constructor(
    private readonly enviar: EnviarDocumentoUseCase,
    private readonly listar: ListarMisDocumentosUseCase,
  ) {}

  @Post('documentos')
  enviarDocumento(@Body() dto: EnviarDocumentoDto, @CurrentUser() user: AuthUser) {
    return this.enviar.execute({ user, ...dto });
  }

  /** Estado de verificación y documentos enviados. */
  @Get('documentos')
  misDocumentos(@CurrentUser() user: AuthUser) {
    return this.listar.execute(user);
  }
}

@ApiTags('Administración')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/documentos')
export class AdminDocumentosController {
  constructor(
    private readonly listar: ListarDocumentosAdminUseCase,
    private readonly revisar: RevisarDocumentoUseCase,
    private readonly obtenerArchivo: ObtenerArchivoDocumentoUseCase,
  ) {}

  @Get()
  cola(@Query() query: DocumentosAdminQueryDto) {
    return this.listar.execute(query);
  }

  /** Devuelve el archivo (inline) para que el administrador lo revise. */
  @Get(':id/archivo')
  async archivo(
    @Param('id', ParseIdPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { contenido, ruta } = await this.obtenerArchivo.execute(id);
    const extension = ruta.split('.').pop() as ExtensionArchivo;
    res.set({
      'Content-Type': MIME_POR_EXTENSION[extension] ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(contenido);
  }

  @Patch(':id/revision')
  revisarDocumento(@Param('id', ParseIdPipe) id: number, @Body() dto: RevisarDocumentoDto) {
    return this.revisar.execute({ idDocumento: id, ...dto });
  }
}
