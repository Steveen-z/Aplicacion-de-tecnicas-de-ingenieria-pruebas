import { AccionAuditoria, EntidadAuditoria, NuevaAuditoria } from '../../../shared/domain/auditoria';
import { EstadoPublicacion, TipoOperacion } from '../../publicaciones/domain/publicacion';
import { DecisionModeracion } from './moderacion';
import { EstadoCuenta, EstadoCuentaAdministrable, FiltroUsuariosAdmin, UsuarioAdminResumen } from './usuario-admin';

export interface Paginacion {
  page: number;
  limit: number;
}
export interface Resultado<T> {
  items: T[];
  total: number;
}

// ------------------------------------------------------------ Usuarios

export const USUARIO_ADMIN_REPOSITORY = Symbol('USUARIO_ADMIN_REPOSITORY');

export interface ResultadoCambioEstado {
  huboCambio: boolean;
  estadoAnterior: EstadoCuenta;
  sesionesCerradas: number;
}

export interface UsuarioAdminRepository {
  listar(filtro: FiltroUsuariosAdmin, paginacion: Paginacion): Promise<Resultado<UsuarioAdminResumen>>;
  buscarPorId(idUsuario: number): Promise<UsuarioAdminResumen | null>;
  /**
   * En una transacción con la fila bloqueada: si el estado ya es el pedido no escribe nada;
   * si no, lo cambia, cierra las sesiones activas al bloquear y escribe la auditoría.
   * null si el usuario no existe.
   */
  cambiarEstado(
    idUsuario: number,
    nuevoEstado: EstadoCuentaAdministrable,
    construirAuditoria: (cambio: { estadoAnterior: EstadoCuenta; sesionesCerradas: number }) => NuevaAuditoria,
  ): Promise<ResultadoCambioEstado | null>;
}

// ------------------------------------------------------------ Publicaciones

export const PUBLICACION_ADMIN_REPOSITORY = Symbol('PUBLICACION_ADMIN_REPOSITORY');

export interface PublicacionAdminResumen {
  idPublicacion: number;
  titulo: string;
  tipoOperacion: TipoOperacion;
  precio: number;
  estado: EstadoPublicacion;
  motivoRechazo: string | null;
  fechaPublicacion: Date;
  vendedor: { idVendedor: number; idUsuario: number; nombre: string; estadoCuenta: EstadoCuenta };
}

export interface FiltroPublicacionesAdmin {
  estado?: EstadoPublicacion;
  tipoOperacion?: TipoOperacion;
  idVendedor?: number;
  q?: string;
}

export interface PublicacionParaModerar {
  idPublicacion: number;
  titulo: string;
  estado: EstadoPublicacion;
  idUsuarioVendedor: number;
}

export interface AvisoAlVendedor {
  idUsuario: number;
  tipo: string;
  titulo: string;
  mensaje: string;
}

export interface PublicacionAdminRepository {
  listar(filtro: FiltroPublicacionesAdmin, paginacion: Paginacion): Promise<Resultado<PublicacionAdminResumen>>;
  buscarParaModerar(idPublicacion: number): Promise<PublicacionParaModerar | null>;
  /**
   * En una transacción: UPDATE condicional (WHERE estado IN decision.desde), aviso al vendedor
   * y auditoría. CONFLICTO si el estado cambió entre la lectura y el UPDATE.
   */
  moderar(
    idPublicacion: number,
    decision: DecisionModeracion,
    aviso: AvisoAlVendedor,
    auditoria: NuevaAuditoria,
  ): Promise<'OK' | 'CONFLICTO' | 'NO_EXISTE'>;
}

// ------------------------------------------------------------ Auditoría (solo lectura)

export const AUDITORIA_REPOSITORY = Symbol('AUDITORIA_REPOSITORY');

export interface RegistroAuditoria {
  idAuditoria: number;
  actor: { idUsuario: number; nombre: string };
  accion: AccionAuditoria;
  entidad: EntidadAuditoria;
  idEntidad: number;
  detalle: Record<string, unknown>;
  fecha: Date;
}

export interface FiltroAuditoria {
  accion?: AccionAuditoria;
  entidad?: EntidadAuditoria;
  idEntidad?: number;
  idActor?: number;
  desde?: Date;
  hasta?: Date;
}

export interface AuditoriaRepository {
  listar(filtro: FiltroAuditoria, paginacion: Paginacion): Promise<Resultado<RegistroAuditoria>>;
}
