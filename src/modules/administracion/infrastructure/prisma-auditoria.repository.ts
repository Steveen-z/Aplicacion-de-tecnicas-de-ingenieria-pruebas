import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccionAuditoria, EntidadAuditoria } from '../../../shared/domain/auditoria';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import {
  AuditoriaRepository,
  FiltroAuditoria,
  Paginacion,
  RegistroAuditoria,
  Resultado,
} from '../domain/administracion.repository';

@Injectable()
export class PrismaAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(f: FiltroAuditoria, { page, limit }: Paginacion): Promise<Resultado<RegistroAuditoria>> {
    const where: Prisma.AuditoriaWhereInput = {
      ...(f.accion ? { accion: f.accion } : {}),
      ...(f.entidad ? { entidad: f.entidad } : {}),
      ...(f.idEntidad ? { idEntidad: big(f.idEntidad) } : {}),
      ...(f.idActor ? { idActor: big(f.idActor) } : {}),
      ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.auditoria.count({ where }),
      this.prisma.auditoria.findMany({
        where,
        include: { actor: { select: { id: true, nombreCompleto: true } } },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      total,
      items: filas.map((a) => ({
        idAuditoria: num(a.id),
        actor: { idUsuario: num(a.actor.id), nombre: a.actor.nombreCompleto },
        accion: a.accion as AccionAuditoria,
        entidad: a.entidad as EntidadAuditoria,
        idEntidad: num(a.idEntidad),
        detalle: a.detalle as Record<string, unknown>,
        fecha: a.fecha,
      })),
    };
  }
}
