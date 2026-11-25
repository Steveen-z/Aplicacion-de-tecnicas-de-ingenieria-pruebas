import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, dec, esViolacionUnica, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { FavoritoVista, PublicacionParaFavorito } from '../domain/favorito';
import { FavoritoRepository } from '../domain/favorito.repository';

@Injectable()
export class PrismaFavoritoRepository implements FavoritoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPublicacion(idPublicacion: number): Promise<PublicacionParaFavorito | null> {
    const row = await this.prisma.publicacion.findUnique({
      where: { id: big(idPublicacion) },
      select: { id: true, estado: true, precio: true },
    });
    return row ? { idPublicacion: num(row.id), estado: row.estado, precio: dec(row.precio) } : null;
  }

  async existe(idCliente: number, idPublicacion: number): Promise<boolean> {
    const total = await this.prisma.favorito.count({
      where: { idCliente: big(idCliente), idPublicacion: big(idPublicacion) },
    });
    return total > 0;
  }

  async crear(idCliente: number, idPublicacion: number, precioAlGuardar: number): Promise<void> {
    try {
      await this.prisma.favorito.create({
        data: { idCliente: big(idCliente), idPublicacion: big(idPublicacion), precioAlGuardar },
      });
    } catch (error) {
      if (!esViolacionUnica(error)) throw error; // ya estaba guardado: nada que hacer
    }
  }

  async eliminar(idCliente: number, idPublicacion: number): Promise<boolean> {
    const { count } = await this.prisma.favorito.deleteMany({
      where: { idCliente: big(idCliente), idPublicacion: big(idPublicacion) },
    });
    return count > 0;
  }

  async listar(idCliente: number): Promise<FavoritoVista[]> {
    const rows = await this.prisma.favorito.findMany({
      where: { idCliente: big(idCliente) },
      orderBy: { fechaGuardado: 'desc' },
      include: {
        publicacion: {
          include: {
            terreno: { include: { ubicacion: true } },
            fotografias: { orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }], take: 1 },
          },
        },
      },
    });

    return rows.map((f) => {
      const { publicacion } = f;
      const precioActual = dec(publicacion.precio);
      const precioAlGuardar = dec(f.precioAlGuardar);
      const variacion = Math.round((precioActual - precioAlGuardar) * 100) / 100;
      return {
        idFavorito: num(f.id),
        idPublicacion: num(f.idPublicacion),
        fechaGuardado: f.fechaGuardado,
        precioAlGuardar,
        precioActual,
        variacion,
        bajoDePrecio: variacion < 0,
        publicacion: {
          titulo: publicacion.titulo,
          estado: publicacion.estado,
          tipoOperacion: publicacion.tipoOperacion,
          areaM2: dec(publicacion.terreno?.areaM2 ?? 0),
          departamento: publicacion.terreno?.ubicacion?.departamento ?? '',
          municipio: publicacion.terreno?.ubicacion?.municipio ?? '',
          portadaUrl: publicacion.fotografias[0]?.urlImagen ?? null,
        },
      };
    });
  }
}
