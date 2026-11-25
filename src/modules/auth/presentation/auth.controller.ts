import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../../shared/domain/auth-user';
import { CurrentUser } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import { ActualizarPerfilUseCase } from '../application/use-cases/actualizar-perfil.use-case';
import { CerrarSesionUseCase } from '../application/use-cases/cerrar-sesion.use-case';
import { IniciarSesionUseCase } from '../application/use-cases/iniciar-sesion.use-case';
import { ObtenerPerfilUseCase } from '../application/use-cases/obtener-perfil.use-case';
import { RegistrarClienteUseCase, RegistroResultado } from '../application/use-cases/registrar-cliente.use-case';
import { RegistrarVendedorUseCase } from '../application/use-cases/registrar-vendedor.use-case';
import { RenovarSesionUseCase } from '../application/use-cases/renovar-sesion.use-case';
import { ActualizarPerfilDto, LoginDto, RegistroClienteDto, RegistroVendedorDto } from './auth.dto';

const LIMITE_ESTRICTO = { default: { limit: 10, ttl: 60_000 } };

function respuestaSesion({ usuario, token, expiraEn }: RegistroResultado) {
  return { usuario, token, tipoToken: 'Bearer', expiraEn };
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registrarCliente: RegistrarClienteUseCase,
    private readonly registrarVendedor: RegistrarVendedorUseCase,
    private readonly iniciarSesion: IniciarSesionUseCase,
    private readonly cerrarSesion: CerrarSesionUseCase,
    private readonly renovarSesion: RenovarSesionUseCase,
    private readonly obtenerPerfil: ObtenerPerfilUseCase,
    private readonly actualizarPerfil: ActualizarPerfilUseCase,
  ) {}

  /** P02 - Registrar cuenta de cliente (devuelve la sesión ya iniciada). */
  @Post('registro/cliente')
  @Throttle(LIMITE_ESTRICTO)
  async registroCliente(@Body() dto: RegistroClienteDto) {
    return respuestaSesion(await this.registrarCliente.execute(dto));
  }

  /** P01 - Registrar cuenta de vendedor (devuelve la sesión ya iniciada). */
  @Post('registro/vendedor')
  @Throttle(LIMITE_ESTRICTO)
  async registroVendedor(@Body() dto: RegistroVendedorDto) {
    return respuestaSesion(await this.registrarVendedor.execute(dto));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    return respuestaSesion(await this.iniciarSesion.execute(dto));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.cerrarSesion.execute(user.idSesion);
  }

  /** Cambia el token actual por uno nuevo (el anterior queda finalizado). */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async refresh(@CurrentUser() user: AuthUser) {
    const { token, expiraEn } = await this.renovarSesion.execute(user);
    return { token, tipoToken: 'Bearer', expiraEn };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return this.obtenerPerfil.execute(user.idUsuario);
  }

  /** Editar el perfil propio: nombre y teléfono (el teléfono vuelve a quedar sin verificar si cambia). */
  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async editarPerfil(@CurrentUser() user: AuthUser, @Body() dto: ActualizarPerfilDto) {
    return this.actualizarPerfil.execute({ user, ...dto });
  }
}
