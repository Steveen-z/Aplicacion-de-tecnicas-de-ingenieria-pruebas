import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { ArchivoRegistrado, ArchivoRepository } from '../domain/archivo.repository';
import { CategoriaArchivo } from '../domain/tipo-archivo';

@Injectable()
export class PrismaArchivoRepository implements ArchivoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(a: ArchivoRegistrado): Promise<void> {
    await this.prisma.archivo.create({ data: { ruta: a.ruta, idUsuario: big(a.idUsuario), categoria: a.categoria } });
  }

  async buscarPorRutas(rutas: string[]): Promise<ArchivoRegistrado[]> {
    if (rutas.length === 0) return [];
    const filas = await this.prisma.archivo.findMany({ where: { ruta: { in: rutas } } });
    return filas.map((f) => ({ ruta: f.ruta, idUsuario: num(f.idUsuario), categoria: f.categoria as CategoriaArchivo }));
  }

  async listarAntiguos(corte: Date, despuesDeId: number, limite: number): Promise<{ idArchivo: number; ruta: string }[]> {
    const filas = await this.prisma.archivo.findMany({
      where: { fecha: { lt: corte }, id: { gt: big(despuesDeId) } },
      orderBy: { id: 'asc' },
      take: limite,
      select: { id: true, ruta: true },
    });
    return filas.map((f) => ({ idArchivo: num(f.id), ruta: f.ruta }));
  }

  async eliminarSiSinReferencia(ruta: string, corte: Date): Promise<boolean> {
    // Una sola sentencia: no hay ventana entre comprobar referencias y borrar. Si alguien
    // la referencia a la vez, la FK RESTRICT hace fallar uno de los dos y nada queda a medias.
    const borradas = await this.prisma.$executeRaw`
      DELETE FROM archivos a
      WHERE a.ruta = ${ruta} AND a.fecha < ${corte}
        AND NOT EXISTS (SELECT 1 FROM fotografias f WHERE f.ruta = a.ruta)
        AND NOT EXISTS (SELECT 1 FROM documentos_verificacion d WHERE d.ruta_documento = a.ruta)`;
    return borradas > 0;
  }

  async eliminarSiSinReferenciaSimulado(ruta: string, corte: Date): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM archivos a
      WHERE a.ruta = ${ruta} AND a.fecha < ${corte}
        AND NOT EXISTS (SELECT 1 FROM fotografias f WHERE f.ruta = a.ruta)
        AND NOT EXISTS (SELECT 1 FROM documentos_verificacion d WHERE d.ruta_documento = a.ruta)`;
    return filas[0].n > 0;
  }

  async rutasRegistradas(rutas: string[]): Promise<Set<string>> {
    const filas = await this.buscarPorRutas(rutas);
    return new Set(filas.map((f) => f.ruta));
  }
}
