import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../domain/auth-user';
import { UnauthorizedError } from '../../domain/errors';
import { SESSION_VALIDATOR, SessionValidator } from '../../domain/session-validator.port';

type RequestConUsuario = Request & { user?: AuthUser };

export function extraerBearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [esquema, token] = header.split(' ');
  return esquema?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Exige una sesión válida. Deja el usuario en `request.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(SESSION_VALIDATOR) private readonly sesiones: SessionValidator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const token = extraerBearer(request);
    if (!token) {
      throw new UnauthorizedError('Debes iniciar sesión para realizar esta acción');
    }
    request.user = await this.sesiones.validar(token);
    return true;
  }
}

/**
 * Para endpoints públicos que cambian su respuesta si hay sesión (p. ej. el listado
 * invita a registrarse a los anónimos). Un token ausente o inválido = anónimo.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(@Inject(SESSION_VALIDATOR) private readonly sesiones: SessionValidator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const token = extraerBearer(request);
    if (!token) return true;
    try {
      request.user = await this.sesiones.validar(token);
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
    }
    return true;
  }
}
