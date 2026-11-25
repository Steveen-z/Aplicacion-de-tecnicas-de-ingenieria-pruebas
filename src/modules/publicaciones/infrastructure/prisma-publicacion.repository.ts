import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, dec, esViolacionFk, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import {
  CambioPrecio,
  CambiosPublicacion,
  Cercania,
  EstadoPublicacion,
  FiltroPublicaciones,
  Fotografia,
  NuevaFotografia,
  NuevaPublicacion,
  OrdenPublicaciones,
  Publicacion,
  PublicacionResumen,
} from '../domain/publicacion';
import {
  AvisoCambioPrecio,
  Paginacion,
  PublicacionRepository,
  ResultadoCambioPrecio,
  ResultadoListado,
} from '../domain/publicacion.repository';
import {
  aFotografia,
  aPublicacion,
  aResumen,
  publicacionInclude,
  resumenInclude,
} from './publicacion.mapper';

// DISTANCIA no se ordena con Prisma: se ordena por la distancia calculada con PostGIS.
const ORDEN: Record<Exclude<OrdenPublicaciones, 'DISTANCIA'>, Prisma.PublicacionOrderByWithRelationInput[]> = {
  RECIENTES: [{ fechaPublicacion: 'desc' }, { id: 'desc' }],
  PRECIO_ASC: [{ precio: 'asc' }, { id: 'desc' }],
  PRECIO_DESC: [{ precio: 'desc' }, { id: 'desc' }],
  AREA_ASC: [{ terreno: { areaM2: 'asc' } }, { id: 'desc' }],
  AREA_DESC: [{ terreno: { areaM2: 'desc' } }, { id: 'desc' }],
};

/** Tope de candidatas de una búsqueda por cercanía (protege memoria y tiempo de respuesta). */
const MAX_CANDIDATAS = 2000;

function traducirArchivoNoDisponible(error: unknown): never {
  if (esViolacionFk(error)) {
    throw new BusinessRuleError('Una de las imágenes ya no está disponible; súbela de nuevo');
  }
  throw error;
}

function conDistancia(resumen: PublicacionResumen, metros: number | undefined): PublicacionResumen {
  return metros === undefined ? resumen : { ...resumen, distanciaKm: Math.round(metros / 100) / 10 };
}

@Injectable()
export class PrismaPublicacionRepository implements PublicacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: NuevaPublicacion): Promise<Publicacion> {
    const { terreno, ubicacion } = datos;
    try {
      const row = await this.prisma.publicacion.create({
        data: {
          idVendedor: big(datos.idVendedor),
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          tipoOperacion: datos.tipoOperacion,
          tipoPropiedad: datos.tipoPropiedad,
          ...(datos.casa ?? {}),
          precio: datos.precio,
          estado: 'ACTIVA',
          terreno: { create: { ...terreno, ubicacion: { create: { ...ubicacion } } } },
          fotografias: {
            create: datos.fotografias.map((f, i) => ({
              urlImagen: f.urlImagen,
              ruta: f.ruta,
              descripcion: f.descripcion,
              orden: i + 1,
              esPortada: f.esPortada,
            })),
          },
        },
        include: publicacionInclude,
      });
      return aPublicacion(row);
    } catch (error) {
      traducirArchivoNoDisponible(error);
    }
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

    // Búsqueda por cercanía: PostGIS (índice GiST sobre el punto público) da las candidatas
    // y su distancia; el resto de filtros se aplica con Prisma sobre esos ids.
    let distancias: Map<bigint, number> | null = null;
    if (filtro.cercania) {
      distancias = await this.candidatasPorCercania(filtro.cercania);
      where.id = { in: [...distancias.keys()] };
    }

    if (filtro.orden === 'DISTANCIA' && distancias) {
      // Se ordena en memoria (máx. MAX_CANDIDATAS filas): suficiente para el volumen del prototipo.
      const rows = await this.prisma.publicacion.findMany({ where, include: resumenInclude });
      rows.sort((a, b) => distancias!.get(a.id)! - distancias!.get(b.id)! || Number(a.id - b.id));
      const pagina = rows.slice((page - 1) * limit, page * limit);
      return { items: pagina.map((r) => conDistancia(aResumen(r), distancias!.get(r.id))), total: rows.length };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicacion.count({ where }),
      this.prisma.publicacion.findMany({
        where,
        orderBy: ORDEN[filtro.orden === 'DISTANCIA' ? 'RECIENTES' : filtro.orden],
        skip: (page - 1) * limit,
        take: limit,
        include: resumenInclude,
      }),
    ]);
    return { items: rows.map((r) => conDistancia(aResumen(r), distancias?.get(r.id))), total };
  }

  /** ids de publicaciones activas cuyo punto público está dentro del radio, con su distancia en metros. */
  private async candidatasPorCercania({ latitud, longitud, radioKm }: Cercania): Promise<Map<bigint, number>> {
    const filas = await this.prisma.$queryRaw<{ id_publicacion: bigint; distancia_m: number }[]>(Prisma.sql`
      WITH centro AS (
        SELECT ST_SetSRID(ST_MakePoint(${longitud}::float8, ${latitud}::float8), 4326)::geography AS punto
      )
      SELECT p.id_publicacion, ST_Distance(u.punto_publico, centro.punto) AS distancia_m
      FROM ubicaciones u
      JOIN terrenos t ON t.id_terreno = u.id_terreno
      JOIN publicaciones p ON p.id_publicacion = t.id_publicacion
      CROSS JOIN centro
      WHERE p.estado = 'ACTIVA'
        AND ST_DWithin(u.punto_publico, centro.punto, ${radioKm * 1000}::float8)
      ORDER BY distancia_m
      LIMIT ${MAX_CANDIDATAS}`);
    return new Map(filas.map((f) => [f.id_publicacion, Number(f.distancia_m)]));
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
      ...(cambios.casa ?? {}),
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

  async cambiarEstado(idPublicacion: number, desde: EstadoPublicacion, hacia: EstadoPublicacion): Promise<boolean> {
    const { count } = await this.prisma.publicacion.updateMany({
      where: { id: big(idPublicacion), estado: desde },
      data: { estado: hacia, fechaActualizacion: new Date() },
    });
    return count === 1;
  }

  async registrarCambioPrecio(
    idPublicacion: number,
    nuevoPrecio: number,
    aviso: AvisoCambioPrecio,
  ): Promise<ResultadoCambioPrecio> {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: dos cambios simultáneos se serializan y el historial no se corrompe.
      const filas = await tx.$queryRaw<{ precio: Prisma.Decimal; estado: string; titulo: string }[]>`
        SELECT precio, estado, titulo FROM publicaciones
        WHERE id_publicacion = ${big(idPublicacion)} FOR UPDATE`;
      if (filas.length === 0) throw new NotFoundError('La publicación no existe');

      const precioAnterior = dec(filas[0].precio);
      // Se compara en centavos para evitar errores de coma flotante.
      if (Math.round(precioAnterior * 100) === Math.round(nuevoPrecio * 100)) {
        return { precioAnterior, huboCambio: false, avisosCreados: 0 };
      }

      await tx.publicacion.update({
        where: { id: big(idPublicacion) },
        data: { precio: nuevoPrecio, fechaActualizacion: new Date() },
      });
      const historial = await tx.historialPrecio.create({
        data: { idPublicacion: big(idPublicacion), precioAnterior, precioNuevo: nuevoPrecio },
        select: { id: true },
      });

      const texto = aviso.decidir({
        titulo: filas[0].titulo,
        estado: filas[0].estado as EstadoPublicacion,
        precioAnterior,
      });
      if (!texto) return { precioAnterior, huboCambio: true, avisosCreados: 0 };

      // Interesados: clientes con la publicación en favoritos y cuenta activa, sin el vendedor.
      const favoritos = await tx.favorito.findMany({
        where: {
          idPublicacion: big(idPublicacion),
          cliente: { usuario: { estadoCuenta: 'ACTIVA', id: { not: big(aviso.excluirIdUsuario) } } },
        },
        select: { cliente: { select: { idUsuario: true } } },
      });
      const destinatarios = [...new Set(favoritos.map((f) => f.cliente.idUsuario))];
      if (destinatarios.length === 0) return { precioAnterior, huboCambio: true, avisosCreados: 0 };

      const { count } = await tx.notificacion.createMany({
        data: destinatarios.map((idUsuario) => ({
          idUsuario,
          idPublicacion: big(idPublicacion),
          idHistorial: historial.id,
          titulo: texto.titulo,
          mensaje: texto.mensaje,
          tipo: 'BAJA_PRECIO',
        })),
        skipDuplicates: true, // UNIQUE (id_usuario, id_historial)
      });
      return { precioAnterior, huboCambio: true, avisosCreados: count };
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
          ruta: f.ruta,
          descripcion: f.descripcion,
          orden: ordenBase + i + 1,
          esPortada: i === indicePortada,
        })),
      });
      return tx.fotografia.findMany({ where: { idPublicacion: id }, orderBy: { orden: 'asc' } });
    }).catch(traducirArchivoNoDisponible);
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

    // Solo publicaciones activas de vendedores con la cuenta activa (un bloqueo las oculta).
    const where: Prisma.PublicacionWhereInput = {
      estado: 'ACTIVA',
      vendedor: { usuario: { estadoCuenta: 'ACTIVA' } },
    };
    if (f.tipoOperacion) where.tipoOperacion = f.tipoOperacion;
    if (f.tipoPropiedad) where.tipoPropiedad = f.tipoPropiedad;
    if (f.habitacionesMin !== undefined) where.habitaciones = { gte: f.habitacionesMin };
    if (f.banosMin !== undefined) where.banos = { gte: f.banosMin };
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
