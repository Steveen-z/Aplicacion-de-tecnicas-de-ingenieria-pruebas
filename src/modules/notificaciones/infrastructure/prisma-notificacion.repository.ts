import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { Notificacion, NotificacionRepository } from '../domain/notificacion';

@Injectable()
export class PrismaNotificacionRepository implements NotificacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    idUsuario: number,
    { soloNoLeidas, page, limit }: { soloNoLeidas: boolean; page: number; limit: number },
  ): Promise<{ items: Notificacion[]; total: number }> {
    const where: Prisma.NotificacionWhereInput = {
      idUsuario: big(idUsuario),
      ...(soloNoLeidas ? { leida: false } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.findMany({
        where,
        orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      total,
      items: rows.map((n) => ({
        idNotificacion: num(n.id),
        idPublicacion: n.idPublicacion === null ? null : num(n.idPublicacion),
        titulo: n.titulo,
        mensaje: n.mensaje,
        tipo: n.tipo,
        fechaCreacion: n.fechaCreacion,
        leida: n.leida,
        fechaLectura: n.fechaLectura,
      })),
    };
  }

  contarNoLeidas(idUsuario: number): Promise<number> {
    return this.prisma.notificacion.count({ where: { idUsuario: big(idUsuario), leida: false } });
  }

  async marcarLeida(idUsuario: number, idNotificacion: number): Promise<boolean> {
    const existe = await this.prisma.notificacion.count({
      where: { id: big(idNotificacion), idUsuario: big(idUsuario) },
    });
    if (existe === 0) return false;

    // El CHECK de la tabla exige fecha_lectura cuando leida = true.
    await this.prisma.notificacion.updateMany({
      where: { id: big(idNotificacion), idUsuario: big(idUsuario), leida: false },
      data: { leida: true, fechaLectura: new Date() },
    });
    return true;
  }

  async marcarTodasLeidas(idUsuario: number): Promise<number> {
    const { count } = await this.prisma.notificacion.updateMany({
      where: { idUsuario: big(idUsuario), leida: false },
      data: { leida: true, fechaLectura: new Date() },
    });
    return count;
  }
}
