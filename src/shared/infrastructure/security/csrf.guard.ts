import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ForbiddenError } from '../../domain/errors';
import { SIN_CSRF_KEY } from './decorators';
import { extraerBearer } from './jwt-auth.guard';
import { CABECERA_CSRF, NOMBRE_COOKIE_SESION, decidirCsrf, leerCookie } from './session-cookie';
import { SesionWebService } from './sesion-web.service';

/** Guard global: protege contra CSRF las peticiones autenticadas por cookie. */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sesionWeb: SesionWebService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const exenta = this.reflector.getAllAndOverride<boolean>(SIN_CSRF_KEY, [context.getHandler(), context.getClass()]) ?? false;
    const motivo = decidirCsrf(
      {
        metodo: req.method,
        tieneBearer: extraerBearer(req) !== null,
        cookieSesion: leerCookie(req.headers.cookie, NOMBRE_COOKIE_SESION),
        origin: req.headers.origin,
        tokenCsrf: req.header(CABECERA_CSRF),
        exenta,
      },
      this.sesionWeb.origenesPermitidos,
      this.sesionWeb.csrf,
    );
    if (motivo) {
      this.logger.warn(JSON.stringify({ evento: 'csrf_rechazado', motivo, metodo: req.method, ruta: req.path, origin: req.headers.origin ?? null }));
      throw new ForbiddenError(motivo);
    }
    return true;
  }
}
