import { AuthUser } from './auth-user';

export const SESSION_VALIDATOR = Symbol('SESSION_VALIDATOR');

/**
 * Puerto que usan los guards compartidos para validar el token de sesión.
 * Lo implementa el módulo de autenticación.
 */
export interface SessionValidator {
  validar(token: string): Promise<AuthUser>;
}
