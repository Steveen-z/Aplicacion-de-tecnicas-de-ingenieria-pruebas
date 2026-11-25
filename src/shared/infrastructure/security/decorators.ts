import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser, Rol } from '../../domain/auth-user';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a uno o más roles. Usar junto a JwtAuthGuard y RolesGuard. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);

type RequestConUsuario = Request & { user?: AuthUser };

/** Inyecta el usuario autenticado (lo deja el guard). Puede ser undefined con OptionalJwtAuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<RequestConUsuario>().user;
});
