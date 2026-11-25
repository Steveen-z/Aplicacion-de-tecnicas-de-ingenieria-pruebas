import { Inject, Injectable } from '@nestjs/common';
import { SESION_REPOSITORY, SesionRepository } from '../../domain/sesion.repository';
import { SESSION_TTL_SECONDS, TOKEN_SERVICE, TokenService } from '../../domain/ports';

export interface SesionEmitida {
  token: string;
  expiraEn: Date;
}

/** Crea el token y registra la sesión (solo el hash del token llega a la base). */
@Injectable()
export class EmitirSesionService {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SESION_REPOSITORY) private readonly sesiones: SesionRepository,
    @Inject(SESSION_TTL_SECONDS) private readonly ttlSegundos: number,
  ) {}

  async emitir(idUsuario: number): Promise<SesionEmitida> {
    const token = this.tokens.firmar(idUsuario, this.ttlSegundos);
    const expiraEn = new Date(Date.now() + this.ttlSegundos * 1000);
    await this.sesiones.crear({
      idUsuario,
      tokenHash: this.tokens.hash(token),
      fechaExpiracion: expiraEn,
    });
    return { token, expiraEn };
  }
}
