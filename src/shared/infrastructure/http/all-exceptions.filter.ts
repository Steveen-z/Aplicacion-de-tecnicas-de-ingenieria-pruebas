import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../../domain/errors';

const STATUS_POR_CODIGO: Record<string, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
};

/**
 * Traduce cualquier error a una respuesta JSON uniforme:
 * { statusCode, code, message, details?, path, timestamp }
 * Los errores inesperados se registran en el log pero nunca exponen detalles al cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Excepciones');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Error interno del servidor';
    let details: unknown;

    if (exception instanceof DomainError) {
      status = STATUS_POR_CODIGO[exception.code] ?? HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else {
        const obj = body as Record<string, unknown>;
        if (Array.isArray(obj.message)) {
          message = 'Los datos enviados no son válidos';
          code = 'VALIDATION_ERROR';
          details = obj.message;
        } else {
          message = typeof obj.message === 'string' ? obj.message : exception.message;
          code = HttpStatus[status] ?? 'HTTP_ERROR';
        }
      }
    } else {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
