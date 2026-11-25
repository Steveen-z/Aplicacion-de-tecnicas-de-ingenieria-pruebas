import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../shared/domain/auth-user';
import { ParseIdPipe } from '../../../shared/infrastructure/http/parse-id.pipe';
import { CurrentUser, Roles } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/security/roles.guard';
import { ListarAuditoriaUseCase } from '../application/auditoria.use-cases';
import { ListarPublicacionesAdminUseCase, ModerarPublicacionUseCase } from '../application/moderacion.use-cases';
import { CambiarEstadoUsuarioUseCase, ListarUsuariosAdminUseCase } from '../application/usuarios-admin.use-cases';
import {
  AuditoriaQueryDto,
  CambiarEstadoUsuarioDto,
  ModerarPublicacionDto,
  PublicacionesAdminQueryDto,
  UsuariosAdminQueryDto,
} from './administracion.dto';

@ApiTags('Administración')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/usuarios')
export class AdminUsuariosController {
  constructor(
    private readonly listar: ListarUsuariosAdminUseCase,
    private readonly cambiarEstado: CambiarEstadoUsuarioUseCase,
  ) {}

  @Get()
  usuarios(@Query() q: UsuariosAdminQueryDto) {
    return this.listar.execute(q);
  }

  /** Bloquear (con motivo; cierra sus sesiones) o reactivar una cuenta. Repetir el mismo estado no cambia nada. */
  @Patch(':id/estado')
  estado(@Param('id', ParseIdPipe) id: number, @Body() dto: CambiarEstadoUsuarioDto, @CurrentUser() actor: AuthUser) {
    return this.cambiarEstado.execute({ actor, idUsuario: id, estado: dto.estado, motivo: dto.motivo });
  }
}

@ApiTags('Administración')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/publicaciones')
export class AdminPublicacionesController {
  constructor(
    private readonly listar: ListarPublicacionesAdminUseCase,
    private readonly moderar: ModerarPublicacionUseCase,
  ) {}

  /** Todas las publicaciones en cualquier estado, con el vendedor y el motivo de rechazo. */
  @Get()
  publicaciones(@Query() q: PublicacionesAdminQueryDto) {
    return this.listar.execute(q);
  }

  /** RECHAZAR (ACTIVA|PAUSADA -> RECHAZADA, motivo obligatorio) o RESTAURAR (RECHAZADA -> PAUSADA). */
  @Patch(':id/moderacion')
  moderacion(@Param('id', ParseIdPipe) id: number, @Body() dto: ModerarPublicacionDto, @CurrentUser() actor: AuthUser) {
    return this.moderar.execute({ actor, idPublicacion: id, accion: dto.accion, motivo: dto.motivo });
  }
}

@ApiTags('Administración')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/auditoria')
export class AdminAuditoriaController {
  constructor(private readonly listar: ListarAuditoriaUseCase) {}

  /** Registro inalterable de acciones administrativas, más reciente primero. */
  @Get()
  auditoria(@Query() q: AuditoriaQueryDto) {
    return this.listar.execute(q);
  }
}
