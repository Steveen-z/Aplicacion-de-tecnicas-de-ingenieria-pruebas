import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '../../../shared/domain/errors';
import { TokenService } from '../domain/ports';

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwt: JwtService) {}

  firmar(idUsuario: number, expiraEnSegundos: number): string {
    // jti aleatorio: dos logins en el mismo segundo producen tokens (y hashes) distintos.
    return this.jwt.sign({ sub: String(idUsuario), jti: randomUUID() }, { expiresIn: expiraEnSegundos });
  }

  verificar(token: string): { idUsuario: number } {
    try {
      const payload = this.jwt.verify<{ sub?: string }>(token, { algorithms: ['HS256'] });
      const idUsuario = Number(payload.sub);
      if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
        throw new Error('sub inválido');
      }
      return { idUsuario };
    } catch {
      throw new UnauthorizedError('La sesión no es válida o ya expiró');
    }
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
