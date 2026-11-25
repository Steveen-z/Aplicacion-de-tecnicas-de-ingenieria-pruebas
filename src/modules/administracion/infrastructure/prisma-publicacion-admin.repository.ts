import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NuevaAuditoria } from '../../../shared/domain/auditoria';
import { escribirAuditoria } from '../../../shared/infrastructure/prisma/auditoria-writer';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, dec, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { EstadoPublicacion, TipoOperacion } from '../../publicaciones/domain/publicacion';
import {
  AvisoAlVendedor,
  FiltroPublicacionesAdmin,
  Paginacion,
  PublicacionAdminRepository,
  PublicacionAdminResumen,
  PublicacionParaModerar,
  Resultado,
} from '../domain/administracion.repository';
import { DecisionModeracion } from '../domain/moderacion';
import { EstadoCuenta } from '../domain/usuario-admin';

const incluir = {
  vendedor: { select: { id: true, idUsuario: true, usuario: { select: { nombreCompleto: true, estadoCuenta: true } } } },
} satisfies Prisma.PublicacionInclude;

@Injectable()
export class PrismaPublicacionAdminRepository implements PublicacionAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(f: FiltroPublicacionesAdmin, { page, limit }: Paginacion): Promise<Resultado<PublicacionAdminResumen>> {
    const where: Prisma.PublicacionWhereInput = {
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.tipoOperacion ? { tipoOperacion: f.tipoOperacion } : {}),
      ...(f.idVendedor ? { idVendedor: big(f.idVendedor) } : {}),
      ...(f.q ? { titulo: { contains: f.q, mode: 'insensitive' } } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.publicacion.count({ where }),
      this.prisma.publicacion.findMany({
        where,
        include: incluir,
        orderBy: [{ fechaPublicacion: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      total,
      items: filas.map((p) => ({
        idPublicacion: num(p.id),
        titulo: p.titulo,
        tipoOperacion: p.tipoOperacion as TipoOperacion,
        precio: dec(p.precio),
        estado: p.estado as EstadoPublicacion,
        motivoRechazo: p.motivoRechazo,
        fechaPublicacion: p.fechaPublicacion,
        vendedor: {
          idVendedor: num(p.vendedor.id),
          idUsuario: num(p.vendedor.idUsuario),
          nombre: p.vendedor.usuario.nombreCompleto,
          estadoCuenta: p.vendedor.usuario.estadoCuenta as EstadoCuenta,
        },
      })),
    };
  }

  async buscarParaModerar(idPublicacion: number): Promise<PublicacionParaModerar | null> {
    const p = await this.prisma.publicacion.findUnique({
      where: { id: big(idPublicacion) },
      select: { id: true, titulo: true, estado: true, vendedor: { select: { idUsuario: true } } },
    });
    return p
      ? { idPublicacion: num(p.id), titulo: p.titulo, estado: p.estado as EstadoPublicacion, idUsuarioVendedor: num(p.vendedor.idUsuario) }
      : null;
  }

  async moderar(
    idPublicacion: number,
    decision: DecisionModeracion,
    aviso: AvisoAlVendedor,
    auditoria: NuevaAuditoria,
  ): Promise<'OK' | 'CONFLICTO' | 'NO_EXISTE'> {
    return this.prisma.$transaction(async (tx) => {
      // UPDATE condicional: si el vendedor cambió el estado entre la lectura y aquí, no se pisa.
      const { count } = await tx.publicacion.updateMany({
        where: { id: big(idPublicacion), estado: { in: decision.desde } },
        data: {
          estado: decision.hacia,
          motivoRechazo: decision.hacia === 'RECHAZADA' ? decision.motivo : null,
          fechaActualizacion: new Date(),
        },
      });
      if (count === 0) {
        const existe = await tx.publicacion.count({ where: { id: big(idPublicacion) } });
        return existe ? 'CONFLICTO' : 'NO_EXISTE';
      }
      await tx.notificacion.create({
        data: {
          idUsuario: big(aviso.idUsuario),
          idPublicacion: big(idPublicacion),
          tipo: aviso.tipo,
          titulo: aviso.titulo,
          mensaje: aviso.mensaje,
        },
      });
      await escribirAuditoria(tx, auditoria);
      return 'OK';
    });
  }
}
