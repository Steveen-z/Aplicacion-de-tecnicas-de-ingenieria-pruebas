import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../shared/domain/auth-user';
import { CurrentUser, Roles } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/security/roles.guard';
import { ListarSolicitudesUseCase } from '../application/listar-solicitudes.use-case';
import { SolicitarCambioRolUseCase } from '../application/solicitar-cambio-rol.use-case';
import { SolicitarCambioRolDto } from './cambio-rol.dto';

@ApiTags('Cambio de rol')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cambio-rol')
export class CambioRolController {
  constructor(
    private readonly solicitarCambio: SolicitarCambioRolUseCase,
    private readonly listarSolicitudes: ListarSolicitudesUseCase,
  ) {}

  /**
   * P03 - Si cumple los requisitos el rol cambia a VENDEDOR de inmediato (el token
   * actual sigue funcionando: el rol se lee de la base en cada petición).
   * Si no, responde 422 con `details.requisitosPendientes`.
   */
  @Post('solicitudes')
  @Roles('CLIENTE')
  solicitar(@CurrentUser() user: AuthUser, @Body() dto: SolicitarCambioRolDto) {
    return this.solicitarCambio.execute({ idUsuario: user.idUsuario, ...dto });
  }

  @Get('solicitudes')
  misSolicitudes(@CurrentUser() user: AuthUser) {
    return this.listarSolicitudes.execute(user.idUsuario);
  }
}
