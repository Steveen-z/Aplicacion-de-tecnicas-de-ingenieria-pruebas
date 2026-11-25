import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import {
  NOMBRE_COOKIE_SESION,
  OpcionesCookieSesion,
  SameSite,
  TokenCsrf,
  opcionesCookie,
} from './session-cookie';

/** Configuración de la sesión del navegador: cookie HttpOnly + token CSRF (decisión del documento de arquitectura). */
@Injectable()
export class SesionWebService {
  readonly csrf: TokenCsrf;
  readonly origenesPermitidos: string[];
  private readonly opciones: OpcionesCookieSesion;

  constructor(config: ConfigService) {
    this.csrf = new TokenCsrf(config.getOrThrow<string>('JWT_SECRET'));
    this.origenesPermitidos = origenesCors(config.get<string>('CORS_ORIGINS'));
    this.opciones = opcionesCookie({
      secure: cookieSegura(config.get('COOKIE_SECURE'), config.get('NODE_ENV')),
      sameSite: (config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase() as SameSite,
      ttlSegundos: Number(config.get('JWT_EXPIRES_IN') ?? 86400),
    });
  }

  /** Pone la cookie de sesión y devuelve el token CSRF que el frontend debe enviar en X-CSRF-Token. */
  fijar(res: Response, token: string): string {
    res.cookie(NOMBRE_COOKIE_SESION, token, this.opciones);
    return this.csrf.generar(token);
  }

  borrar(res: Response): void {
    const { maxAge: _maxAge, ...sinDuracion } = this.opciones;
    res.clearCookie(NOMBRE_COOKIE_SESION, sinDuracion);
  }
}

export function origenesCors(valor: string | undefined): string[] {
  return (valor ?? 'http://localhost:5173,http://localhost:3001,http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function cookieSegura(cookieSecure: unknown, nodeEnv: unknown): boolean {
  if (cookieSecure === 'true') return true;
  if (cookieSecure === 'false') return false;
  return nodeEnv === 'production';
}
