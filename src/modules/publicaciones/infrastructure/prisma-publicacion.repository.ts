import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/domain/errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, dec, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import {
  CambioPrecio,
  CambiosPublicacion,
  EstadoPublicacion,
  FiltroPublicaciones,
  Fotografia,
  NuevaFotografia,
  NuevaPublicacion,
  OrdenPublicaciones,
  Publicacion,
} from '../domain/publicacion';
import {
  Paginacion,
  PublicacionRepository,
  ResultadoListado,
} from '../domain/publicacion.repository';
import {
  aFotografia,
  aPublicacion,
  aResumen,
  publicacionInclude,
  resumenInclude,
} from './publicacion.mapper';

const ORDEN: Record<OrdenPublicaciones, Prisma.PublicacionOrderByWithRelationInput[]> = {
  RECIENTES: [{ fechaPublicacion: 'desc' }, { id: 'desc' }],
  PRECIO_ASC: [{ precio: 'asc' }, { id: 'desc' }],
  PRECIO_DESC: [{ precio: 'desc' }, { id: 'desc' }],
  AREA_ASC: [{ terreno: { areaM2: 'asc' } }, { id: 'desc' }],
  AREA_DESC: [{ terreno: { areaM2: 'desc' } }, { id: 'desc' }],
};

@Injectable()
export class PrismaPublicacionRepository implements PublicacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: NuevaPublicacion): Promise<Publicacion> {
    const { terreno, ubicacion } = datos;
    const row = await this.prisma.publicacion.create({
      data: {
        idVendedor: big(datos.idVendedor),
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        tipoOperacion: datos.tipoOperacion,
        precio: datos.precio,
        estado: 'ACTIVA',
        terreno: { create: { ...terreno, ubicacion: { create: { ...ubicacion } } } },
        fotografias: {
          create: datos.fotografias.map((f, i) => ({
            urlImagen: f.urlImagen,
            descripcion: f.descripcion,
            orden: i + 1,
            esPortada: f.esPortada,
          })),
        },
      },
      include: publicacionInclude,
    });
    return aPublicacion(row);
  }

  async buscarPorId(idPublicacion: number): Promise<Publicacion | null> {
    const row = await this.prisma.publicacion.findUnique({
      where: { id: big(idPublicacion) },
      include: publicacionInclude,
    });
    return row ? aPublicacion(row) : null;
  }

  async buscarActivas(filtro: FiltroPublicaciones, { page, limit }: Paginacion): Promise<ResultadoListado> {
    const where = this.construirWhere(filtro);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicacion.count({ where }),
      this.prisma.publicacion.findMany({
        where,
        orderBy: ORDEN[filtro.orden],
        skip: (page - 1) * limit,
        take: limit,
        include: resumenInclude,
      }),
    ]);
    return { items: rows.map(aResumen), total };
  }

  async listarDeVendedor(
    idVendedor: number,
    estado: EstadoPublicacion | undefined,
    { page, limit }: Paginacion,
  ): Promise<ResultadoListado> {
    const where: Prisma.PublicacionWhereInput = {
      idVendedor: big(idVendedor),
      ...(estado ? { estado } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicacion.count({ where }),
      this.prisma.publicacion.findMany({
        where,
        orderBy: ORDEN.RECIENTES,
        skip: (page - 1) * limit,
        take: limit,
        include: resumenInclude,
      }),
    ]);
    return { items: rows.map(aResumen), total };
  }

  async actualizar(idPublicacion: number, cambios: CambiosPublicacion): Promise<Publicacion> {
    const terrenoData: Prisma.TerrenoUpdateInput = { ...(cambios.terreno ?? {}) };
    if (cambios.ubicacion) {
      terrenoData.ubicacion = { update: { ...cambios.ubicacion } };
    }

    const data: Prisma.PublicacionUpdateInput = {
      titulo: cambios.titulo,
      descripcion: cambios.descripcion,
      // Los updates anidados no tocan la fila padre, así que la fecha se fija a mano.
      fechaActualizacion: new Date(),
    };
    if (Object.keys(terrenoData).length > 0) {
      data.terreno = { update: terrenoData };
    }

    const row = await this.prisma.publicacion.update({
      where: { id: big(idPublicacion) },
      data,
      include: publicacionInclude,
    });
    return aPublicacion(row);
  }

  async cambiarEstado(idPublicacion: number, estado: EstadoPublicacion): Promise<void> {
    await this.prisma.publicacion.update({
      where: { id: big(idPublicacion) },
      data: { estado, fechaActualizacion: new Date() },
    });
  }

  async registrarCambioPrecio(
    idPublicacion: number,
    nuevoPrecio: number,
  ): Promise<{ precioAnterior: number; huboCambio: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: dos cambios simultáneos se serializan y el historial no se corrompe.
      const filas = await tx.$queryRaw<{ precio: Prisma.Decimal }[]>`
        SELECT precio FROM publicaciones WHERE id_publicacion = ${big(idPublicacion)} FOR UPDATE`;
      if (filas.length === 0) throw new NotFoundError('La publicación no existe');

      const precioAnterior = dec(filas[0].precio);
      // Se compara en centavos para evitar errores de coma flotante.
      if (Math.round(precioAnterior * 100) === Math.round(nuevoPrecio * 100)) {
        return { precioAnterior, huboCambio: false };
      }

      await tx.publicacion.update({
        where: { id: big(idPublicacion) },
        data: { precio: nuevoPrecio, fechaActualizacion: new Date() },
      });
      await tx.historialPrecio.create({
        data: { idPublicacion: big(idPublicacion), precioAnterior, precioNuevo: nuevoPrecio },
      });
      return { precioAnterior, huboCambio: true };
    });
  }

  async listarHistorialPrecios(idPublicacion: number): Promise<CambioPrecio[]> {
    const rows = await this.prisma.historialPrecio.findMany({
      where: { idPublicacion: big(idPublicacion) },
      orderBy: { fechaCambio: 'desc' },
    });
    return rows.map((r) => ({
      idHistorial: num(r.id),
      precioAnterior: dec(r.precioAnterior),
      precioNuevo: dec(r.precioNuevo),
      fechaCambio: r.fechaCambio,
    }));
  }

  async agregarFotografias(idPublicacion: number, fotos: NuevaFotografia[]): Promise<Fotografia[]> {
    const id = big(idPublicacion);
    const filas = await this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.fotografia.aggregate({ where: { idPublicacion: id }, _max: { orden: true } });
      const existentes = await tx.fotografia.count({ where: { idPublicacion: id } });
      const ordenBase = _max.orden ?? 0;

      // Una sola portada: la primera nueva marcada; si no hay ninguna portada aún, la primera foto.
      let indicePortada = fotos.findIndex((f) => f.esPortada);
      if (indicePortada === -1 && existentes === 0) indicePortada = 0;
      if (indicePortada !== -1) {
        await tx.fotografia.updateMany({ where: { idPublicacion: id }, data: { esPortada: false } });
      }

      await tx.fotografia.createMany({
        data: fotos.map((f, i) => ({
          idPublicacion: id,
          urlImagen: f.urlImagen,
          descripcion: f.descripcion,
          orden: ordenBase + i + 1,
          esPortada: i === indicePortada,
        })),
      });
      return tx.fotografia.findMany({ where: { idPublicacion: id }, orderBy: { orden: 'asc' } });
    });
    return filas.map(aFotografia);
  }

  async eliminarFotografia(idPublicacion: number, idFotografia: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const foto = await tx.fotografia.findFirst({
        where: { id: big(idFotografia), idPublicacion: big(idPublicacion) },
      });
      if (!foto) return false;

      await tx.fotografia.delete({ where: { id: foto.id } });
      if (foto.esPortada) {
        const siguiente = await tx.fotografia.findFirst({
          where: { idPublicacion: big(idPublicacion) },
          orderBy: { orden: 'asc' },
        });
        if (siguiente) {
          await tx.fotografia.update({ where: { id: siguiente.id }, data: { esPortada: true } });
        }
      }
      return true;
    });
  }

  async definirPortada(idPublicacion: number, idFotografia: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const foto = await tx.fotografia.findFirst({
        where: { id: big(idFotografia), idPublicacion: big(idPublicacion) },
      });
      if (!foto) return false;

      await tx.fotografia.updateMany({ where: { idPublicacion: big(idPublicacion) }, data: { esPortada: false } });
      await tx.fotografia.update({ where: { id: foto.id }, data: { esPortada: true } });
      return true;
    });
  }

  private construirWhere(f: FiltroPublicaciones): Prisma.PublicacionWhereInput {
    const rango = (min?: number, max?: number): { gte?: number; lte?: number } => ({
      ...(min !== undefined ? { gte: min } : {}),
      ...(max !== undefined ? { lte: max } : {}),
    });
    const precio = rango(f.precioMin, f.precioMax);
    const area = rango(f.areaMin, f.areaMax);

    const ubicacion: Prisma.UbicacionWhereInput = {};
    if (f.departamento) ubicacion.departamento = { equals: f.departamento, mode: 'insensitive' };
    if (f.municipio) ubicacion.municipio = { equals: f.municipio, mode: 'insensitive' };

    const terreno: Prisma.TerrenoWhereInput = {};
    if (Object.keys(area).length > 0) terreno.areaM2 = area;
    if (Object.keys(ubicacion).length > 0) terreno.ubicacion = { is: ubicacion };

    const where: Prisma.PublicacionWhereInput = { estado: 'ACTIVA' };
    if (f.tipoOperacion) where.tipoOperacion = f.tipoOperacion;
    if (Object.keys(precio).length > 0) where.precio = precio;
    if (Object.keys(terreno).length > 0) where.terreno = { is: terreno };
    if (f.q) {
      where.OR = [
        { titulo: { contains: f.q, mode: 'insensitive' } },
        { descripcion: { contains: f.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
