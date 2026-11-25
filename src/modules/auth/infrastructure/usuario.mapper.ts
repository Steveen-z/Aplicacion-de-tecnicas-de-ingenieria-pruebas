import { Prisma } from '@prisma/client';
import { Rol } from '../../../shared/domain/auth-user';
import { num } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { EstadoCuenta, Usuario, UsuarioConCredenciales } from '../domain/usuario';

export const usuarioInclude = { cliente: true, vendedor: true } satisfies Prisma.UsuarioInclude;

export type UsuarioRow = Prisma.UsuarioGetPayload<{ include: typeof usuarioInclude }>;

export function aUsuario(row: UsuarioRow): Usuario {
  return {
    idUsuario: num(row.id),
    nombreCompleto: row.nombreCompleto,
    correo: row.correo,
    telefono: row.telefono,
    telefonoVerificado: row.telefonoVerificado,
    rol: row.rol as Rol,
    estadoCuenta: row.estadoCuenta as EstadoCuenta,
    fechaRegistro: row.fechaRegistro,
    idCliente: row.cliente ? num(row.cliente.id) : null,
    idVendedor: row.vendedor ? num(row.vendedor.id) : null,
  };
}

export function aUsuarioConCredenciales(row: UsuarioRow): UsuarioConCredenciales {
  return { ...aUsuario(row), passwordHash: row.passwordHash };
}
