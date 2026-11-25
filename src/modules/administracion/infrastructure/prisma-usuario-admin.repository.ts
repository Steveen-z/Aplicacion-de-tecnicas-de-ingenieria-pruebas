import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NuevaAuditoria } from '../../../shared/domain/auditoria';
import { Rol } from '../../../shared/domain/auth-user';
import { escribirAuditoria } from '../../../shared/infrastructure/prisma/auditoria-writer';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import {
  Paginacion,
  Resultado,
  ResultadoCambioEstado,
  UsuarioAdminRepository,
} from '../domain/administracion.repository';
import {
  EstadoCuenta,
  EstadoCuentaAdministrable,
  FiltroUsuariosAdmin,
  UsuarioAdminResumen,
} from '../domain/usuario-admin';

const incluir = { vendedor: { select: { id: true, estadoVerificacion: true } } } satisfies Prisma.UsuarioInclude;
type Fila = Prisma.UsuarioGetPayload<{ include: typeof incluir }>;

const aResumen = (u: Fila): UsuarioAdminResumen => ({
  idUsuario: num(u.id),
  nombreCompleto: u.nombreCompleto,
  correo: u.correo,
  telefono: u.telefono,
  rol: u.rol as Rol,
  estadoCuenta: u.estadoCuenta as EstadoCuenta,
  fechaRegistro: u.fechaRegistro,
  idVendedor: u.vendedor ? num(u.vendedor.id) : null,
  estadoVerificacion: u.vendedor?.estadoVerificacion ?? null,
});

@Injectable()
export class PrismaUsuarioAdminRepository implements UsuarioAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(f: FiltroUsuariosAdmin, { page, limit }: Paginacion): Promise<Resultado<UsuarioAdminResumen>> {
    const where: Prisma.UsuarioWhereInput = {
      ...(f.rol ? { rol: f.rol } : {}),
      ...(f.estado ? { estadoCuenta: f.estado } : {}),
      ...(f.q
        ? {
            OR: [
              { nombreCompleto: { contains: f.q, mode: 'insensitive' } },
              { correo: { contains: f.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        include: incluir,
        orderBy: [{ fechaRegistro: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: filas.map(aResumen), total };
  }

  async buscarPorId(idUsuario: number): Promise<UsuarioAdminResumen | null> {
    const u = await this.prisma.usuario.findUnique({ where: { id: big(idUsuario) }, include: incluir });
    return u ? aResumen(u) : null;
  }

  async cambiarEstado(
    idUsuario: number,
    nuevoEstado: EstadoCuentaAdministrable,
    construirAuditoria: (cambio: { estadoAnterior: EstadoCuenta; sesionesCerradas: number }) => NuevaAuditoria,
  ): Promise<ResultadoCambioEstado | null> {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: dos admins actuando a la vez se serializan y la decisión usa el valor vigente.
      const filas = await tx.$queryRaw<{ estado_cuenta: string }[]>`
        SELECT estado_cuenta FROM usuarios WHERE id_usuario = ${big(idUsuario)} FOR UPDATE`;
      if (filas.length === 0) return null;
      const estadoAnterior = filas[0].estado_cuenta as EstadoCuenta;
      if (estadoAnterior === nuevoEstado) return { huboCambio: false, estadoAnterior, sesionesCerradas: 0 };

      await tx.usuario.update({
        where: { id: big(idUsuario) },
        data: { estadoCuenta: nuevoEstado, fechaActualizacion: new Date() },
      });
      let sesionesCerradas = 0;
      if (nuevoEstado === 'BLOQUEADA') {
        const r = await tx.sesion.updateMany({
          where: { idUsuario: big(idUsuario), activa: true },
          data: { activa: false, fechaFinalizacion: new Date() },
        });
        sesionesCerradas = r.count;
      }
      await escribirAuditoria(tx, construirAuditoria({ estadoAnterior, sesionesCerradas }));
      return { huboCambio: true, estadoAnterior, sesionesCerradas };
    });
  }
}
