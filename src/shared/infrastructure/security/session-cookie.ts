import { createHmac, timingSafeEqual } from 'node:crypto';

/** Cookie de sesión para el frontend: contiene el mismo JWT que se devuelve en el cuerpo. */
export const NOMBRE_COOKIE_SESION = 'inmobisv_sesion';
export const CABECERA_CSRF = 'x-csrf-token';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type SameSite = 'lax' | 'strict' | 'none';

export interface OpcionesCookieSesion {
  httpOnly: true;
  secure: boolean;
  sameSite: SameSite;
  path: string;
  maxAge: number; // milisegundos (formato de Express)
}

export function opcionesCookie(config: { secure: boolean; sameSite: SameSite; ttlSegundos: number }): OpcionesCookieSesion {
  return { httpOnly: true, secure: config.secure, sameSite: config.sameSite, path: '/api', maxAge: config.ttlSegundos * 1000 };
}

/** Lee una cookie de la cabecera Cookie sin dependencias (no se usan cookies firmadas). */
export function leerCookie(cabecera: string | undefined, nombre: string): string | null {
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) {
      const valor = parte.slice(i + 1).trim();
      try {
        return valor ? decodeURIComponent(valor) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Token CSRF sin estado: HMAC-SHA256 del valor de la cookie de sesión con una clave derivada
 * de JWT_SECRET. Un sitio ajeno no puede leer la cookie (HttpOnly) ni calcular el token.
 */
export class TokenCsrf {
  private readonly clave: Buffer;

  constructor(secreto: string) {
    this.clave = createHmac('sha256', secreto).update('inmobisv-csrf-v1').digest();
  }

  generar(valorCookie: string): string {
    return createHmac('sha256', this.clave).update(valorCookie).digest('base64url');
  }

  verificar(valorCookie: string, token: string | undefined | null): boolean {
    if (!token) return false;
    const esperado = Buffer.from(this.generar(valorCookie));
    const recibido = Buffer.from(token);
    return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  }
}

export interface PeticionCsrf {
  metodo: string;
  tieneBearer: boolean;
  cookieSesion: string | null;
  origin: string | undefined;
  tokenCsrf: string | undefined;
  exenta: boolean;
}

/**
 * Decide si una petición pasa la protección CSRF. Devuelve null si pasa o el motivo del rechazo.
 * - Métodos seguros, rutas exentas (login/registro) y peticiones con Bearer pasan: un navegador
 *   no añade Authorization por su cuenta en una petición entre sitios.
 * - Sin cookie de sesión no hay nada que proteger.
 * - Con cookie: si llega Origin debe estar permitido, y X-CSRF-Token es obligatorio y válido.
 */
export function decidirCsrf(p: PeticionCsrf, origenesPermitidos: string[], csrf: TokenCsrf): string | null {
  if (METODOS_SEGUROS.has(p.metodo.toUpperCase()) || p.exenta || p.tieneBearer || !p.cookieSesion) return null;
  if (p.origin && !origenesPermitidos.includes(p.origin)) return 'Origen no permitido';
  if (!csrf.verificar(p.cookieSesion, p.tokenCsrf)) return 'Token CSRF ausente o inválido';
  return null;
}
