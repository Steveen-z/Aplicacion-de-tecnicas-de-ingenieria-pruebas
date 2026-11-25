import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser, Rol } from '../../domain/auth-user';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors';
import { ROLES_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requeridos || requeridos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!user) throw new UnauthorizedError('Debes iniciar sesión para realizar esta acción');
    if (!requeridos.includes(user.rol)) {
      throw new ForbiddenError('Tu rol no tiene permiso para realizar esta acción');
    }
    return true;
  }
}
