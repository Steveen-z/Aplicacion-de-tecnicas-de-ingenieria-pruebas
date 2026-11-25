import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import {
  DocumentoConVendedor,
  DocumentoVerificacion,
  EstadoRevision,
  EstadoVerificacion,
  ResolverEstadoEnvio,
  ResolverEstadoRevision,
} from '../domain/documento';
import { DocumentoRepository, ResultadoDocumento } from '../domain/documento.repository';

type DocumentoRow = {
  id: bigint;
  idVendedor: bigint;
  tipoDocumento: string;
  rutaDocumento: string;
  fechaEnvio: Date;
  estadoRevision: string;
  observaciones: string | null;
  fechaRevision: Date | null;
};

const aDocumento = (row: DocumentoRow): DocumentoVerificacion => ({
  idDocumento: num(row.id),
  idVendedor: num(row.idVendedor),
  tipoDocumento: row.tipoDocumento,
  rutaDocumento: row.rutaDocumento,
  fechaEnvio: row.fechaEnvio,
  estadoRevision: row.estadoRevision as EstadoRevision,
  observaciones: row.observaciones,
  fechaRevision: row.fechaRevision,
});

const aResumen = (row: DocumentoRow) => ({
  idDocumento: num(row.id),
  tipoDocumento: row.tipoDocumento,
  estadoRevision: row.estadoRevision as EstadoRevision,
});

@Injectable()
export class PrismaDocumentoRepository implements DocumentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async registrarDocumento(
    idVendedor: number,
    tipoDocumento: string,
    rutaDocumento: string,
    resolverEstado: ResolverEstadoEnvio,
  ): Promise<ResultadoDocumento> {
    return this.prisma.$transaction(async (tx) => {
      const vendedor = await tx.vendedor.findUnique({ where: { id: big(idVendedor) } });
      if (!vendedor) throw new NotFoundError('El vendedor no existe');

      const creado = await tx.documentoVerificacion.create({
        data: { idVendedor: big(idVendedor), tipoDocumento, rutaDocumento },
      });
      const documentos = await tx.documentoVerificacion.findMany({ where: { idVendedor: big(idVendedor) } });

      const estadoVerificacion = resolverEstado(
        vendedor.estadoVerificacion as EstadoVerificacion,
        documentos.map(aResumen),
      );
      await tx.vendedor.update({ where: { id: vendedor.id }, data: { estadoVerificacion } });

      return { documento: aDocumento(creado), estadoVerificacion };
    });
  }

  async revisarDocumento(
    idDocumento: number,
    revision: { estado: 'APROBADO' | 'RECHAZADO'; observaciones: string | null },
    resolverEstado: ResolverEstadoRevision,
  ): Promise<ResultadoDocumento | null> {
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.documentoVerificacion.findUnique({ where: { id: big(idDocumento) } });
      if (!existente) return null;

      const actualizado = await tx.documentoVerificacion.update({
        where: { id: existente.id },
        data: {
          estadoRevision: revision.estado,
          observaciones: revision.observaciones,
          fechaRevision: new Date(),
        },
      });
      const documentos = await tx.documentoVerificacion.findMany({ where: { idVendedor: existente.idVendedor } });

      const estadoVerificacion = resolverEstado(documentos.map(aResumen));
      await tx.vendedor.update({ where: { id: existente.idVendedor }, data: { estadoVerificacion } });

      return { documento: aDocumento(actualizado), estadoVerificacion };
    });
  }

  async buscarPorId(idDocumento: number): Promise<DocumentoVerificacion | null> {
    const row = await this.prisma.documentoVerificacion.findUnique({ where: { id: big(idDocumento) } });
    return row ? aDocumento(row) : null;
  }

  async listarDeVendedor(idVendedor: number): Promise<DocumentoVerificacion[]> {
    const rows = await this.prisma.documentoVerificacion.findMany({
      where: { idVendedor: big(idVendedor) },
      orderBy: { fechaEnvio: 'desc' },
    });
    return rows.map(aDocumento);
  }

  async obtenerEstadoVendedor(idVendedor: number): Promise<EstadoVerificacion | null> {
    const row = await this.prisma.vendedor.findUnique({
      where: { id: big(idVendedor) },
      select: { estadoVerificacion: true },
    });
    return row ? (row.estadoVerificacion as EstadoVerificacion) : null;
  }

  async listarPorEstado(
    estado: EstadoRevision,
    { page, limit }: { page: number; limit: number },
  ): Promise<{ items: DocumentoConVendedor[]; total: number }> {
    const where = { estadoRevision: estado };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.documentoVerificacion.count({ where }),
      this.prisma.documentoVerificacion.findMany({
        where,
        orderBy: { fechaEnvio: 'asc' }, // los más antiguos primero: cola de revisión
        skip: (page - 1) * limit,
        take: limit,
        include: { vendedor: { include: { usuario: true } } },
      }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        ...aDocumento(row),
        vendedor: {
          idVendedor: num(row.vendedor.id),
          nombre: row.vendedor.usuario.nombreCompleto,
          correo: row.vendedor.usuario.correo,
          dui: row.vendedor.dui,
        },
      })),
    };
  }
}
