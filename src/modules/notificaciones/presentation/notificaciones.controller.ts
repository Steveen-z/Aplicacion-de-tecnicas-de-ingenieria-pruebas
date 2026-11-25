import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { AuthUser } from '../../../shared/domain/auth-user';
import { PaginationQueryDto } from '../../../shared/infrastructure/http/pagination-query.dto';
import { ParseIdPipe } from '../../../shared/infrastructure/http/parse-id.pipe';
import { CurrentUser } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import {
  ContarNoLeidasUseCase,
  ListarNotificacionesUseCase,
  MarcarLeidaUseCase,
  MarcarTodasLeidasUseCase,
} from '../application/notificaciones.use-cases';

export class ListarNotificacionesQueryDto extends PaginationQueryDto {
  /** ?soloNoLeidas=true */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  soloNoLeidas: boolean = false;
}

@ApiTags('Notificaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly listar: ListarNotificacionesUseCase,
    private readonly contar: ContarNoLeidasUseCase,
    private readonly marcarLeida: MarcarLeidaUseCase,
    private readonly marcarTodas: MarcarTodasLeidasUseCase,
  ) {}

  @Get()
  misNotificaciones(@Query() query: ListarNotificacionesQueryDto, @CurrentUser() user: AuthUser) {
    return this.listar.execute({ idUsuario: user.idUsuario, ...query });
  }

  /** Para el globito de la campana. */
  @Get('no-leidas/conteo')
  conteo(@CurrentUser() user: AuthUser) {
    return this.contar.execute(user.idUsuario);
  }

  // 'leer-todas' va antes que ':id/leida' para que no se confunda con un id.
  @Patch('leer-todas')
  leerTodas(@CurrentUser() user: AuthUser) {
    return this.marcarTodas.execute(user.idUsuario);
  }

  @Patch(':id/leida')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leer(@Param('id', ParseIdPipe) id: number, @CurrentUser() user: AuthUser): Promise<void> {
    await this.marcarLeida.execute(user.idUsuario, id);
  }
}
