export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export const SESSION_TTL_SECONDS = Symbol('SESSION_TTL_SECONDS');

export interface PasswordHasher {
  hash(plano: string): Promise<string>;
  comparar(plano: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  /** Firma un token con el id del usuario como `sub`. */
  firmar(idUsuario: number, expiraEnSegundos: number): string;
  /** Verifica firma y expiración. Lanza UnauthorizedError si no es válido. */
  verificar(token: string): { idUsuario: number };
  /** Hash determinista (SHA-256) del token; es lo único que se guarda en la base. */
  hash(token: string): string;
}
