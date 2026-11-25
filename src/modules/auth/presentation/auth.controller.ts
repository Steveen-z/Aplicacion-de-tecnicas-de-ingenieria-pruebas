import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../../shared/domain/auth-user';
import { CurrentUser, SinCsrf } from '../../../shared/infrastructure/security/decorators';
import { SesionWebService } from '../../../shared/infrastructure/security/sesion-web.service';
import { NOMBRE_COOKIE_SESION, leerCookie } from '../../../shared/infrastructure/security/session-cookie';
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

/**
 * Respuesta de inicio de sesión. El token va en el cuerpo (Swagger, scripts: Authorization: Bearer)
 * y en la cookie HttpOnly (frontend). El frontend debe ignorar `token` y enviar `csrfToken`
 * en la cabecera X-CSRF-Token en las peticiones POST/PATCH/PUT/DELETE.
 */
function respuestaSesion({ usuario, token, expiraEn }: RegistroResultado, csrfToken: string) {
  return { usuario, token, tipoToken: 'Bearer', expiraEn, csrfToken };
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
    private readonly sesionWeb: SesionWebService,
  ) {}

  private iniciar(res: Response, resultado: RegistroResultado) {
    return respuestaSesion(resultado, this.sesionWeb.fijar(res, resultado.token));
  }

  /** P02 - Registrar cuenta de cliente (devuelve la sesión ya iniciada). */
  @Post('registro/cliente')
  @Throttle(LIMITE_ESTRICTO)
  @SinCsrf()
  async registroCliente(@Body() dto: RegistroClienteDto, @Res({ passthrough: true }) res: Response) {
    return this.iniciar(res, await this.registrarCliente.execute(dto));
  }

  /** P01 - Registrar cuenta de vendedor (devuelve la sesión ya iniciada). */
  @Post('registro/vendedor')
  @Throttle(LIMITE_ESTRICTO)
  @SinCsrf()
  async registroVendedor(@Body() dto: RegistroVendedorDto, @Res({ passthrough: true }) res: Response) {
    return this.iniciar(res, await this.registrarVendedor.execute(dto));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @SinCsrf()
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.iniciar(res, await this.iniciarSesion.execute(dto));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.cerrarSesion.execute(user.idSesion);
    this.sesionWeb.borrar(res);
  }

  /** Cambia el token actual por uno nuevo (el anterior queda finalizado). */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async refresh(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const { token, expiraEn } = await this.renovarSesion.execute(user);
    return { token, tipoToken: 'Bearer', expiraEn, csrfToken: this.sesionWeb.fijar(res, token) };
  }

  /** Token CSRF de la sesión por cookie (p. ej. tras recargar la página). Con Bearer devuelve null. */
  @Get('csrf')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  csrf(@Req() req: Request) {
    const cookie = leerCookie(req.headers.cookie, NOMBRE_COOKIE_SESION);
    return { csrfToken: cookie ? this.sesionWeb.csrf.generar(cookie) : null };
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
