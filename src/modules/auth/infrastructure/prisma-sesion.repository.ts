import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { SesionActiva, SesionRepository } from '../domain/sesion.repository';
import { aUsuario, usuarioInclude } from './usuario.mapper';

@Injectable()
export class PrismaSesionRepository implements SesionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: { idUsuario: number; tokenHash: string; fechaExpiracion: Date }): Promise<number> {
    const row = await this.prisma.sesion.create({
      data: {
        idUsuario: big(datos.idUsuario),
        tokenHash: datos.tokenHash,
        fechaExpiracion: datos.fechaExpiracion,
      },
    });
    return num(row.id);
  }

  async buscarActivaPorHash(tokenHash: string): Promise<SesionActiva | null> {
    const row = await this.prisma.sesion.findFirst({
      where: {
        tokenHash,
        activa: true,
        fechaFinalizacion: null,
        fechaExpiracion: { gt: new Date() },
      },
      include: { usuario: { include: usuarioInclude } },
    });
    if (!row) return null;
    return {
      idSesion: num(row.id),
      fechaExpiracion: row.fechaExpiracion,
      usuario: aUsuario(row.usuario),
    };
  }

  async finalizar(idSesion: number): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { id: big(idSesion), activa: true },
      data: { activa: false, fechaFinalizacion: new Date() },
    });
  }
}
