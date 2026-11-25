import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, dec, decOrNull, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { ComparacionGuardada, TerrenoComparable } from '../domain/comparacion';
import { ComparacionRepository } from '../domain/comparacion.repository';

@Injectable()
export class PrismaComparacionRepository implements ComparacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerTerrenos(idsPublicaciones: number[]): Promise<TerrenoComparable[]> {
    const rows = await this.prisma.publicacion.findMany({
      where: { id: { in: idsPublicaciones.map(big) } },
      include: {
        terreno: { include: { ubicacion: true } },
        vendedor: { select: { usuario: { select: { estadoCuenta: true } } } },
        fotografias: { orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }], take: 1 },
      },
    });

    const terrenos = rows.flatMap((p): TerrenoComparable[] => {
      if (!p.terreno || !p.terreno.ubicacion) return [];
      const precio = dec(p.precio);
      const areaM2 = dec(p.terreno.areaM2);
      return [
        {
          idPublicacion: num(p.id),
          titulo: p.titulo,
          tipoOperacion: p.tipoOperacion,
          precio,
          estado: p.estado,
          disponible: p.estado === 'ACTIVA' && p.vendedor.usuario.estadoCuenta === 'ACTIVA',
          areaM2,
          largoM: decOrNull(p.terreno.largoM),
          anchoM: decOrNull(p.terreno.anchoM),
          tipoTerreno: p.terreno.tipoTerreno,
          caracteristicas: p.terreno.caracteristicas,
          departamento: p.terreno.ubicacion.departamento,
          municipio: p.terreno.ubicacion.municipio,
          distrito: p.terreno.ubicacion.distrito,
          portadaUrl: p.fotografias[0]?.urlImagen ?? null,
          precioPorM2: Math.round((precio / areaM2) * 100) / 100,
        },
      ];
    });

    // Se conserva el orden en que el cliente eligió los terrenos.
    return idsPublicaciones.flatMap((id) => terrenos.filter((t) => t.idPublicacion === id));
  }

  async crear(idCliente: number, idsPublicaciones: number[]): Promise<ComparacionGuardada> {
    const row = await this.prisma.comparacion.create({
      data: {
        idCliente: big(idCliente),
        detalles: { create: idsPublicaciones.map((id) => ({ idPublicacion: big(id) })) },
      },
      include: { detalles: true },
    });
    return {
      idComparacion: num(row.id),
      fechaCreacion: row.fechaCreacion,
      // El orden elegido por el cliente se conserva en la respuesta de creación.
      idsPublicaciones,
    };
  }

  async buscarPorId(idComparacion: number, idCliente: number): Promise<ComparacionGuardada | null> {
    const row = await this.prisma.comparacion.findFirst({
      where: { id: big(idComparacion), idCliente: big(idCliente) },
      include: { detalles: true },
    });
    return row ? this.aGuardada(row) : null;
  }

  async listar(idCliente: number): Promise<ComparacionGuardada[]> {
    const rows = await this.prisma.comparacion.findMany({
      where: { idCliente: big(idCliente) },
      orderBy: { fechaCreacion: 'desc' },
      take: 50,
      include: { detalles: true },
    });
    return rows.map((r) => this.aGuardada(r));
  }

  private aGuardada(row: {
    id: bigint;
    fechaCreacion: Date;
    detalles: { idPublicacion: bigint }[];
  }): ComparacionGuardada {
    return {
      idComparacion: num(row.id),
      fechaCreacion: row.fechaCreacion,
      idsPublicaciones: row.detalles.map((d) => num(d.idPublicacion)),
    };
  }
}
