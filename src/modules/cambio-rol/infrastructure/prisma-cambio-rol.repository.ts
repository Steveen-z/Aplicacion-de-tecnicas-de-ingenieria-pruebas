import { Injectable } from '@nestjs/common';
import { Rol } from '../../../shared/domain/auth-user';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, esViolacionUnica, num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { CambioRolRepository } from '../domain/cambio-rol.repository';
import {
  DatosVendedorSolicitados,
  EstadoSolicitud,
  PerfilParaCambioRol,
  SolicitudCambioRol,
} from '../domain/solicitud-cambio-rol';

@Injectable()
export class PrismaCambioRolRepository implements CambioRolRepository {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPerfil(idUsuario: number): Promise<PerfilParaCambioRol | null> {
    const row = await this.prisma.usuario.findUnique({
      where: { id: big(idUsuario) },
      include: { vendedor: true },
    });
    if (!row) return null;
    return {
      idUsuario: num(row.id),
      nombreCompleto: row.nombreCompleto,
      telefono: row.telefono,
      rol: row.rol as Rol,
      idVendedor: row.vendedor ? num(row.vendedor.id) : null,
    };
  }

  async duiEnUso(dui: string): Promise<boolean> {
    return (await this.prisma.vendedor.count({ where: { dui } })) > 0;
  }

  async aprobarCambio(
    idUsuario: number,
    datos: DatosVendedorSolicitados,
  ): Promise<{ idSolicitud: number; idVendedor: number }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findUnique({
          where: { id: big(idUsuario) },
          include: { vendedor: true },
        });
        if (!usuario) throw new NotFoundError('El usuario no existe');
        if (usuario.vendedor || usuario.rol === 'VENDEDOR') {
          throw new ConflictError('Tu cuenta ya tiene el rol de vendedor');
        }

        const vendedor = await tx.vendedor.create({
          data: { idUsuario: big(idUsuario), dui: datos.dui, numeroWhatsapp: datos.numeroWhatsapp },
        });
        await tx.usuario.update({
          where: { id: big(idUsuario) },
          data: { rol: 'VENDEDOR', ...(datos.telefono ? { telefono: datos.telefono } : {}) },
        });
        const solicitud = await tx.solicitudCambioRol.create({
          data: { idUsuario: big(idUsuario), estado: 'APROBADA', fechaResolucion: new Date() },
        });
        return { idSolicitud: num(solicitud.id), idVendedor: num(vendedor.id) };
      });
    } catch (error) {
      if (esViolacionUnica(error)) {
        throw new ConflictError('El DUI ya está registrado en otra cuenta');
      }
      throw error;
    }
  }

  async registrarRechazo(idUsuario: number, requisitosPendientes: string[]): Promise<void> {
    await this.prisma.solicitudCambioRol.create({
      data: {
        idUsuario: big(idUsuario),
        estado: 'RECHAZADA',
        fechaResolucion: new Date(),
        requisitosPendientes: requisitosPendientes.join('; '),
      },
    });
  }

  async listarSolicitudes(idUsuario: number): Promise<SolicitudCambioRol[]> {
    const rows = await this.prisma.solicitudCambioRol.findMany({
      where: { idUsuario: big(idUsuario) },
      orderBy: { fechaSolicitud: 'desc' },
    });
    return rows.map((r) => ({
      idSolicitud: num(r.id),
      fechaSolicitud: r.fechaSolicitud,
      estado: r.estado as EstadoSolicitud,
      requisitosPendientes: r.requisitosPendientes,
      fechaResolucion: r.fechaResolucion,
      observaciones: r.observaciones,
    }));
  }
}
