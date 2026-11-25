import { Injectable } from '@nestjs/common';
import { ConflictError } from '../../../shared/domain/errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big, esViolacionUnica } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { Usuario, UsuarioConCredenciales } from '../domain/usuario';
import { DatosVendedor, NuevoUsuario, UsuarioRepository } from '../domain/usuario.repository';
import { aUsuario, aUsuarioConCredenciales, usuarioInclude } from './usuario.mapper';

@Injectable()
export class PrismaUsuarioRepository implements UsuarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async existePorCorreo(correo: string): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: { correo } })) > 0;
  }

  async existeDui(dui: string): Promise<boolean> {
    return (await this.prisma.vendedor.count({ where: { dui } })) > 0;
  }

  async crearCliente(datos: NuevoUsuario): Promise<Usuario> {
    try {
      const row = await this.prisma.usuario.create({
        data: { ...datos, rol: 'CLIENTE', cliente: { create: {} } },
        include: usuarioInclude,
      });
      return aUsuario(row);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async crearVendedor(datos: NuevoUsuario & DatosVendedor): Promise<Usuario> {
    const { dui, numeroWhatsapp, ...usuario } = datos;
    try {
      const row = await this.prisma.usuario.create({
        data: {
          ...usuario,
          rol: 'VENDEDOR',
          cliente: { create: {} },
          vendedor: { create: { dui, numeroWhatsapp } },
        },
        include: usuarioInclude,
      });
      return aUsuario(row);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async buscarConCredencialesPorCorreo(correo: string): Promise<UsuarioConCredenciales | null> {
    const row = await this.prisma.usuario.findUnique({ where: { correo }, include: usuarioInclude });
    return row ? aUsuarioConCredenciales(row) : null;
  }

  async buscarPorId(idUsuario: number): Promise<Usuario | null> {
    const row = await this.prisma.usuario.findUnique({
      where: { id: big(idUsuario) },
      include: usuarioInclude,
    });
    return row ? aUsuario(row) : null;
  }

  /** Cubre la carrera entre el "existe" y el "crea": la restricción UNIQUE manda. */
  private traducir(error: unknown): unknown {
    return esViolacionUnica(error) ? new ConflictError('El correo o el DUI ya están registrados') : error;
  }
}
