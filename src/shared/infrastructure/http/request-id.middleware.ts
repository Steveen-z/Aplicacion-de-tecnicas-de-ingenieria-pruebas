import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/** Formato aceptado para un X-Request-Id que envía el cliente (evita inyectar texto arbitrario en los logs). */
const ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;

export type RequestConId = Request & { requestId?: string; user?: { idUsuario?: number } };

export function obtenerRequestId(req: Request): string | undefined {
  return (req as RequestConId).requestId;
}

/**
 * Asigna un identificador a cada petición: reutiliza X-Request-Id si es válido o genera un UUID.
 * Se devuelve en la cabecera de respuesta y aparece en el log de acceso y en los errores,
 * para poder correlacionar lo que ve el usuario con lo que quedó en el servidor.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const entrante = req.header('x-request-id');
  const id = entrante && ID_VALIDO.test(entrante) ? entrante : randomUUID();
  (req as RequestConId).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

const accesoLogger = new Logger('HTTP');

/**
 * Log de acceso: una línea JSON por petición al terminar (método, ruta sin query, estado,
 * duración, usuario). De aquí se derivan tasa, errores y duración (RED). Nunca registra
 * cuerpos, cabeceras, tokens ni cookies.
 */
export function accesoLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const r = req as RequestConId;
    const linea = JSON.stringify({
      evento: 'http',
      requestId: r.requestId,
      metodo: req.method,
      ruta: req.originalUrl.split('?')[0],
      estado: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      idUsuario: r.user?.idUsuario ?? null,
    });
    if (res.statusCode >= 500) accesoLogger.error(linea);
    else if (res.statusCode >= 400) accesoLogger.warn(linea);
    else accesoLogger.log(linea);
  });
  next();
}
