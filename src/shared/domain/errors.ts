/**
 * Errores de dominio. La capa de dominio y aplicación solo lanza estos errores;
 * el filtro HTTP los traduce a códigos de estado (no hay dependencia de Nest aquí).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 404 - el recurso no existe o no es visible para quien lo pide. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/** 409 - choca con el estado actual (correo repetido, favorito duplicado...). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

/** 422 - la petición es válida en forma pero incumple una regla de negocio. */
export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE';
}

/** 401 - no hay sesión válida o las credenciales no son correctas. */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
}

/** 403 - hay sesión pero no tiene permiso para la acción. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}
