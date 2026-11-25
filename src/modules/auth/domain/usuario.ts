import { Rol } from '../../../shared/domain/auth-user';

export type EstadoCuenta = 'ACTIVA' | 'INACTIVA' | 'BLOQUEADA';

export interface Usuario {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  telefono: string | null;
  telefonoVerificado: boolean;
  rol: Rol;
  estadoCuenta: EstadoCuenta;
  fechaRegistro: Date;
  idCliente: number | null;
  idVendedor: number | null;
}

/** Solo se usa internamente para el login; nunca sale por la API. */
export interface UsuarioConCredenciales extends Usuario {
  passwordHash: string;
}
