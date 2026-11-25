import { Prisma } from '@prisma/client';
import { dec, decOrNull, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import {
  DatosCasa,
  EstadoPublicacion,
  Fotografia,
  Publicacion,
  PublicacionResumen,
  TipoOperacion,
  TipoPropiedad,
} from '../domain/publicacion';

export const publicacionInclude = {
  terreno: { include: { ubicacion: true } },
  fotografias: { orderBy: { orden: 'asc' } },
  vendedor: { include: { usuario: true } },
} satisfies Prisma.PublicacionInclude;

export const resumenInclude = {
  terreno: { include: { ubicacion: true } },
  fotografias: { orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }], take: 1 },
} satisfies Prisma.PublicacionInclude;

type PublicacionRow = Prisma.PublicacionGetPayload<{ include: typeof publicacionInclude }>;
type ResumenRow = Prisma.PublicacionGetPayload<{ include: typeof resumenInclude }>;
type FotografiaRow = PublicacionRow['fotografias'][number];

export function aFotografia(row: FotografiaRow): Fotografia {
  return {
    idFotografia: num(row.id),
    urlImagen: row.urlImagen,
    descripcion: row.descripcion,
    orden: row.orden,
    esPortada: row.esPortada,
  };
}

export function aPublicacion(row: PublicacionRow): Publicacion {
  const { terreno } = row;
  if (!terreno || !terreno.ubicacion) {
    // El esquema los exige (1 a 1), así que esto indica datos corruptos.
    throw new Error(`La publicación ${row.id} no tiene terreno o ubicación`);
  }
  const { ubicacion } = terreno;

  return {
    idPublicacion: num(row.id),
    idVendedor: num(row.idVendedor),
    titulo: row.titulo,
    descripcion: row.descripcion,
    tipoOperacion: row.tipoOperacion as TipoOperacion,
    tipoPropiedad: row.tipoPropiedad as TipoPropiedad,
    casa: aCasa(row),
    precio: dec(row.precio),
    estado: row.estado as EstadoPublicacion,
    fechaPublicacion: row.fechaPublicacion,
    fechaActualizacion: row.fechaActualizacion,
    motivoRechazo: row.motivoRechazo,
    terreno: {
      idTerreno: num(terreno.id),
      areaM2: dec(terreno.areaM2),
      largoM: decOrNull(terreno.largoM),
      anchoM: decOrNull(terreno.anchoM),
      tipoTerreno: terreno.tipoTerreno,
      caracteristicas: terreno.caracteristicas,
    },
    ubicacion: {
      departamento: ubicacion.departamento,
      municipio: ubicacion.municipio,
      distrito: ubicacion.distrito,
      direccionDetalle: ubicacion.direccionDetalle,
      latitud: decOrNull(ubicacion.latitud),
      longitud: decOrNull(ubicacion.longitud),
      latitudPublica: decOrNull(ubicacion.latitudPublica),
      longitudPublica: decOrNull(ubicacion.longitudPublica),
    },
    fotografias: row.fotografias.map(aFotografia),
    vendedor: {
      idVendedor: num(row.vendedor.id),
      idUsuario: num(row.vendedor.idUsuario),
      nombre: row.vendedor.usuario.nombreCompleto,
      telefono: row.vendedor.usuario.telefono,
      numeroWhatsapp: row.vendedor.numeroWhatsapp,
      estadoVerificacion: row.vendedor.estadoVerificacion,
      estadoCuenta: row.vendedor.usuario.estadoCuenta,
    },
  };
}

/** Datos de casa de una fila; null si no es CASA. */
export function aCasa(row: {
  tipoPropiedad: string;
  habitaciones: number | null;
  banos: number | null;
  areaConstruidaM2: Prisma.Decimal | null;
  niveles: number | null;
  estacionamientos: number | null;
}): DatosCasa | null {
  if (row.tipoPropiedad !== 'CASA' || row.habitaciones === null || row.banos === null || row.areaConstruidaM2 === null) {
    return null;
  }
  return {
    habitaciones: row.habitaciones,
    banos: row.banos,
    areaConstruidaM2: dec(row.areaConstruidaM2),
    niveles: row.niveles,
    estacionamientos: row.estacionamientos,
  };
}

export function aResumen(row: ResumenRow): PublicacionResumen {
  const { terreno } = row;
  if (!terreno || !terreno.ubicacion) {
    throw new Error(`La publicación ${row.id} no tiene terreno o ubicación`);
  }
  return {
    idPublicacion: num(row.id),
    titulo: row.titulo,
    tipoOperacion: row.tipoOperacion as TipoOperacion,
    tipoPropiedad: row.tipoPropiedad as TipoPropiedad,
    habitaciones: row.habitaciones,
    banos: row.banos,
    areaConstruidaM2: decOrNull(row.areaConstruidaM2),
    precio: dec(row.precio),
    estado: row.estado as EstadoPublicacion,
    areaM2: dec(terreno.areaM2),
    departamento: terreno.ubicacion.departamento,
    municipio: terreno.ubicacion.municipio,
    distrito: terreno.ubicacion.distrito,
    portadaUrl: row.fotografias[0]?.urlImagen ?? null,
    fechaPublicacion: row.fechaPublicacion,
    latitud: terreno.ubicacion.latitudPublica === null ? null : dec(terreno.ubicacion.latitudPublica),
    longitud: terreno.ubicacion.longitudPublica === null ? null : dec(terreno.ubicacion.longitudPublica),
    distanciaKm: null,
  };
}
