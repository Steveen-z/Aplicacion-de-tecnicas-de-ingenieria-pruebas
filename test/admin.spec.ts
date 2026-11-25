/**
 * Administración: reglas de bloqueo y moderación, y casos de uso con repositorios falsos.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NuevaAuditoria } from '../src/shared/domain/auditoria';
import { AuthUser } from '../src/shared/domain/auth-user';
import { BusinessRuleError, ConflictError, DomainError, ForbiddenError, NotFoundError } from '../src/shared/domain/errors';
import { calcularModeracion } from '../src/modules/administracion/domain/moderacion';
import { EstadoCuenta, UsuarioAdminResumen, decidirCambioEstado } from '../src/modules/administracion/domain/usuario-admin';
import {
  AuditoriaRepository,
  AvisoAlVendedor,
  PublicacionAdminRepository,
  PublicacionParaModerar,
  UsuarioAdminRepository,
} from '../src/modules/administracion/domain/administracion.repository';
import { CambiarEstadoUsuarioUseCase } from '../src/modules/administracion/application/usuarios-admin.use-cases';
import { ModerarPublicacionUseCase } from '../src/modules/administracion/application/moderacion.use-cases';
import { ListarAuditoriaUseCase } from '../src/modules/administracion/application/auditoria.use-cases';
import { DecisionModeracion } from '../src/modules/administracion/domain/moderacion';
import { RevisarDocumentoUseCase } from '../src/modules/verificacion/application/verificacion.use-cases';
import { DocumentoRepository } from '../src/modules/verificacion/domain/documento.repository';
import { DocumentoVerificacion } from '../src/modules/verificacion/domain/documento';
import { CambiarEstadoUseCase } from '../src/modules/publicaciones/application/cambiar-estado.use-case';
import { PublicacionRepository } from '../src/modules/publicaciones/domain/publicacion.repository';
import { Publicacion } from '../src/modules/publicaciones/domain/publicacion';

async function rechaza<E extends DomainError>(p: Promise<unknown>, tipo: new (...a: never[]) => E): Promise<E> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof tipo, `se esperaba ${tipo.name} y llegó ${(e as Error)?.name}: ${(e as Error)?.message}`);
    return e;
  }
  assert.fail(`se esperaba ${tipo.name}`);
}

const admin: AuthUser = { idUsuario: 1, idSesion: 1, nombreCompleto: 'Admin', correo: 'a@a', rol: 'ADMIN', idCliente: 1, idVendedor: null };
// Los logs WARN de los casos de uso no ensucian la salida de las pruebas.
const silenciar = <T>(uc: T): T => {
  (uc as unknown as { logger: { warn: () => void } }).logger = { warn: () => {} };
  return uc;
};

// ============================================================ Reglas puras

describe('decidirCambioEstado', () => {
  const vendedor = { idUsuario: 5, rol: 'VENDEDOR' as const };
  it('bloquear exige motivo; autobloqueo y bloqueo de admin -> 403 (antes que el 422)', () => {
    assert.deepEqual(decidirCambioEstado({ idActor: 1, objetivo: vendedor, nuevoEstado: 'BLOQUEADA', motivo: ' spam ' }), { motivo: 'spam' });
    assert.throws(() => decidirCambioEstado({ idActor: 1, objetivo: vendedor, nuevoEstado: 'BLOQUEADA' }), BusinessRuleError);
    assert.throws(() => decidirCambioEstado({ idActor: 1, objetivo: { idUsuario: 1, rol: 'ADMIN' }, nuevoEstado: 'BLOQUEADA' }), ForbiddenError);
    assert.throws(() => decidirCambioEstado({ idActor: 1, objetivo: { idUsuario: 2, rol: 'ADMIN' }, nuevoEstado: 'BLOQUEADA', motivo: 'x' }), ForbiddenError);
  });
  it('reactivar no exige motivo; motivo demasiado largo -> 422', () => {
    assert.deepEqual(decidirCambioEstado({ idActor: 1, objetivo: vendedor, nuevoEstado: 'ACTIVA' }), { motivo: null });
    assert.throws(() => decidirCambioEstado({ idActor: 1, objetivo: vendedor, nuevoEstado: 'ACTIVA', motivo: 'x'.repeat(501) }), BusinessRuleError);
  });
});

describe('calcularModeracion', () => {
  it('RECHAZAR solo desde ACTIVA/PAUSADA y con motivo', () => {
    assert.deepEqual(calcularModeracion('RECHAZAR', 'ACTIVA', 'Fotos falsas'), { desde: ['ACTIVA', 'PAUSADA'], hacia: 'RECHAZADA', motivo: 'Fotos falsas' });
    assert.equal(calcularModeracion('RECHAZAR', 'PAUSADA', 'x').hacia, 'RECHAZADA');
    for (const estado of ['VENDIDA', 'RENTADA', 'PENDIENTE', 'RECHAZADA'] as const) {
      assert.throws(() => calcularModeracion('RECHAZAR', estado, 'x'), BusinessRuleError);
    }
    assert.throws(() => calcularModeracion('RECHAZAR', 'ACTIVA', '   '), BusinessRuleError);
  });
  it('RESTAURAR solo desde RECHAZADA y deja la publicación PAUSADA', () => {
    assert.deepEqual(calcularModeracion('RESTAURAR', 'RECHAZADA'), { desde: ['RECHAZADA'], hacia: 'PAUSADA', motivo: null });
    assert.throws(() => calcularModeracion('RESTAURAR', 'ACTIVA'), BusinessRuleError);
  });
});

// ============================================================ Usuarios

class UsuariosAdminFalso implements UsuarioAdminRepository {
  auditorias: NuevaAuditoria[] = [];
  sesionesActivas = new Map<number, number>([[5, 2]]);
  filas = new Map<number, UsuarioAdminResumen>();
  constructor() {
    const base = { correo: '', telefono: null, fechaRegistro: new Date(), idVendedor: null, estadoVerificacion: null };
    this.filas.set(1, { ...base, idUsuario: 1, nombreCompleto: 'Admin', rol: 'ADMIN', estadoCuenta: 'ACTIVA' });
    this.filas.set(2, { ...base, idUsuario: 2, nombreCompleto: 'Otro admin', rol: 'ADMIN', estadoCuenta: 'ACTIVA' });
    this.filas.set(5, { ...base, idUsuario: 5, nombreCompleto: 'Vendedor', rol: 'VENDEDOR', estadoCuenta: 'ACTIVA' });
  }
  async listar() {
    return { items: [...this.filas.values()], total: this.filas.size };
  }
  async buscarPorId(id: number) {
    return this.filas.get(id) ?? null;
  }
  async cambiarEstado(id: number, nuevo: 'ACTIVA' | 'BLOQUEADA', construir: (c: { estadoAnterior: EstadoCuenta; sesionesCerradas: number }) => NuevaAuditoria) {
    const fila = this.filas.get(id);
    if (!fila) return null;
    const estadoAnterior = fila.estadoCuenta;
    if (estadoAnterior === nuevo) return { huboCambio: false, estadoAnterior, sesionesCerradas: 0 };
    fila.estadoCuenta = nuevo;
    const sesionesCerradas = nuevo === 'BLOQUEADA' ? (this.sesionesActivas.get(id) ?? 0) : 0;
    if (nuevo === 'BLOQUEADA') this.sesionesActivas.set(id, 0);
    this.auditorias.push(construir({ estadoAnterior, sesionesCerradas }));
    return { huboCambio: true, estadoAnterior, sesionesCerradas };
  }
}

describe('CambiarEstadoUsuarioUseCase', () => {
  it('bloquear: cambia el estado, cierra sesiones y audita con el motivo', async () => {
    const repo = new UsuariosAdminFalso();
    const r = await silenciar(new CambiarEstadoUsuarioUseCase(repo)).execute({ actor: admin, idUsuario: 5, estado: 'BLOQUEADA', motivo: 'Fraude' });
    assert.deepEqual(r, { idUsuario: 5, estadoCuenta: 'BLOQUEADA', huboCambio: true, estadoAnterior: 'ACTIVA', sesionesCerradas: 2 });
    assert.deepEqual(repo.auditorias, [
      { idActor: 1, accion: 'USUARIO_BLOQUEADO', entidad: 'USUARIO', idEntidad: 5, detalle: { motivo: 'Fraude', estadoAnterior: 'ACTIVA', estadoNuevo: 'BLOQUEADA', sesionesCerradas: 2 } },
    ]);
  });

  it('repetir el mismo estado es idempotente: 200 sin segunda auditoría', async () => {
    const repo = new UsuariosAdminFalso();
    const uc = silenciar(new CambiarEstadoUsuarioUseCase(repo));
    await uc.execute({ actor: admin, idUsuario: 5, estado: 'BLOQUEADA', motivo: 'Fraude' });
    const r = await uc.execute({ actor: admin, idUsuario: 5, estado: 'BLOQUEADA', motivo: 'Fraude' });
    assert.equal(r.huboCambio, false);
    assert.equal(repo.auditorias.length, 1);
  });

  it('reactivar audita USUARIO_ACTIVADO; 404 inexistente; 403 autobloqueo y otro admin; 422 sin motivo', async () => {
    const repo = new UsuariosAdminFalso();
    const uc = silenciar(new CambiarEstadoUsuarioUseCase(repo));
    await uc.execute({ actor: admin, idUsuario: 5, estado: 'BLOQUEADA', motivo: 'x' });
    await uc.execute({ actor: admin, idUsuario: 5, estado: 'ACTIVA' });
    assert.equal(repo.auditorias[1].accion, 'USUARIO_ACTIVADO');
    await rechaza(uc.execute({ actor: admin, idUsuario: 99, estado: 'ACTIVA' }), NotFoundError);
    await rechaza(uc.execute({ actor: admin, idUsuario: 1, estado: 'BLOQUEADA', motivo: 'x' }), ForbiddenError);
    await rechaza(uc.execute({ actor: admin, idUsuario: 2, estado: 'BLOQUEADA', motivo: 'x' }), ForbiddenError);
    await rechaza(uc.execute({ actor: admin, idUsuario: 5, estado: 'BLOQUEADA' }), BusinessRuleError);
    assert.equal(repo.auditorias.length, 2);
  });
});

// ============================================================ Moderación

class PublicacionesAdminFalso implements PublicacionAdminRepository {
  avisos: AvisoAlVendedor[] = [];
  auditorias: NuevaAuditoria[] = [];
  forzarConflicto = false;
  constructor(public pub: PublicacionParaModerar | null) {}
  async listar() {
    return { items: [], total: 0 };
  }
  async buscarParaModerar() {
    return this.pub ? { ...this.pub } : null;
  }
  async moderar(_id: number, d: DecisionModeracion, aviso: AvisoAlVendedor, auditoria: NuevaAuditoria) {
    if (!this.pub) return 'NO_EXISTE' as const;
    if (this.forzarConflicto || !d.desde.includes(this.pub.estado)) return 'CONFLICTO' as const;
    this.pub.estado = d.hacia;
    this.avisos.push(aviso);
    this.auditorias.push(auditoria);
    return 'OK' as const;
  }
}
const pubActiva = (): PublicacionParaModerar => ({ idPublicacion: 7, titulo: 'Lote', estado: 'ACTIVA', idUsuarioVendedor: 50 });

describe('ModerarPublicacionUseCase', () => {
  it('rechazar: queda RECHAZADA, avisa al vendedor con el motivo y audita', async () => {
    const repo = new PublicacionesAdminFalso(pubActiva());
    const r = await silenciar(new ModerarPublicacionUseCase(repo)).execute({ actor: admin, idPublicacion: 7, accion: 'RECHAZAR', motivo: 'Fotos de otra propiedad' });
    assert.deepEqual(r, { idPublicacion: 7, estado: 'RECHAZADA', estadoAnterior: 'ACTIVA', motivo: 'Fotos de otra propiedad' });
    assert.equal(repo.avisos[0].idUsuario, 50);
    assert.match(repo.avisos[0].mensaje, /Fotos de otra propiedad/);
    assert.equal(repo.auditorias[0].accion, 'PUBLICACION_RECHAZADA');
  });

  it('restaurar deja PAUSADA; transiciones inválidas o sin motivo -> 422; inexistente -> 404', async () => {
    const repo = new PublicacionesAdminFalso({ ...pubActiva(), estado: 'RECHAZADA' });
    const uc = silenciar(new ModerarPublicacionUseCase(repo));
    assert.equal((await uc.execute({ actor: admin, idPublicacion: 7, accion: 'RESTAURAR' })).estado, 'PAUSADA');
    await rechaza(uc.execute({ actor: admin, idPublicacion: 7, accion: 'RESTAURAR' }), BusinessRuleError);
    await rechaza(uc.execute({ actor: admin, idPublicacion: 7, accion: 'RECHAZAR' }), BusinessRuleError);
    await rechaza(silenciar(new ModerarPublicacionUseCase(new PublicacionesAdminFalso({ ...pubActiva(), estado: 'VENDIDA' }))).execute({ actor: admin, idPublicacion: 7, accion: 'RECHAZAR', motivo: 'x' }), BusinessRuleError);
    await rechaza(silenciar(new ModerarPublicacionUseCase(new PublicacionesAdminFalso(null))).execute({ actor: admin, idPublicacion: 7, accion: 'RESTAURAR' }), NotFoundError);
  });

  it('si el estado cambió entre la lectura y el UPDATE -> 409 sin aviso ni auditoría', async () => {
    const repo = new PublicacionesAdminFalso(pubActiva());
    repo.forzarConflicto = true;
    await rechaza(silenciar(new ModerarPublicacionUseCase(repo)).execute({ actor: admin, idPublicacion: 7, accion: 'RECHAZAR', motivo: 'x' }), ConflictError);
    assert.equal(repo.avisos.length + repo.auditorias.length, 0);
  });
});

// ============================================================ Auditoría

describe('ListarAuditoriaUseCase', () => {
  const repo: AuditoriaRepository = { listar: async () => ({ items: [], total: 0 }) };
  it('desde posterior a hasta -> 422; rango válido pagina', async () => {
    const uc = new ListarAuditoriaUseCase(repo);
    await rechaza(uc.execute({ page: 1, limit: 10, desde: new Date('2026-12-01'), hasta: new Date('2026-11-01') }), BusinessRuleError);
    const r = await uc.execute({ page: 1, limit: 10, desde: new Date('2026-11-01'), hasta: new Date('2026-12-01') });
    assert.equal(r.total, 0);
  });
});

// ============================================================ Revisión de documentos

describe('RevisarDocumentoUseCase', () => {
  const doc = (estadoRevision: DocumentoVerificacion['estadoRevision']): DocumentoVerificacion => ({
    idDocumento: 3, idVendedor: 9, tipoDocumento: 'DUI_FRENTE', rutaDocumento: 'documentos/x.pdf',
    fechaEnvio: new Date(), estadoRevision, observaciones: null, fechaRevision: null,
  });
  function repoDocs(actual: DocumentoVerificacion, respuesta: 'OK' | 'YA_REVISADO' = 'OK') {
    const auditorias: NuevaAuditoria[] = [];
    const repo = {
      async buscarPorId() {
        return actual;
      },
      async revisarDocumento(_id: number, rev: { estado: 'APROBADO' | 'RECHAZADO' }, _r: unknown, construir: (x: { documento: DocumentoVerificacion; estadoVerificacion: 'VERIFICADO' }) => NuevaAuditoria) {
        if (respuesta === 'YA_REVISADO') return 'YA_REVISADO' as const;
        const resultado = { documento: { ...actual, estadoRevision: rev.estado }, estadoVerificacion: 'VERIFICADO' as const };
        auditorias.push(construir(resultado));
        return resultado;
      },
    } as unknown as DocumentoRepository;
    return { repo, auditorias };
  }

  it('aprobar audita DOCUMENTO_APROBADO con el admin como actor', async () => {
    const { repo, auditorias } = repoDocs(doc('PENDIENTE'));
    await new RevisarDocumentoUseCase(repo).execute({ idActor: 1, idDocumento: 3, estado: 'APROBADO' });
    assert.deepEqual(auditorias.map((a) => [a.idActor, a.accion, a.entidad, a.idEntidad]), [[1, 'DOCUMENTO_APROBADO', 'DOCUMENTO', 3]]);
  });

  it('otro admin lo revisó primero (carrera) -> 409', async () => {
    const { repo, auditorias } = repoDocs(doc('PENDIENTE'), 'YA_REVISADO');
    await rechaza(new RevisarDocumentoUseCase(repo).execute({ idActor: 1, idDocumento: 3, estado: 'APROBADO' }), ConflictError);
    assert.equal(auditorias.length, 0);
  });
});

// ============================================================ Vendedor vs. moderación concurrente

describe('CambiarEstadoUseCase (vendedor) con UPDATE condicional', () => {
  it('si el admin cambió el estado entretanto -> 409', async () => {
    const pub = { idPublicacion: 7, idVendedor: 3, estado: 'ACTIVA', tipoOperacion: 'VENTA', fotografias: [{}] } as unknown as Publicacion;
    const repo = {
      buscarPorId: async () => pub,
      cambiarEstado: async (_id: number, desde: string) => desde === 'RECHAZADA', // en la BD ya está RECHAZADA
    } as unknown as PublicacionRepository;
    const vendedor: AuthUser = { ...admin, rol: 'VENDEDOR', idVendedor: 3 };
    await rechaza(new CambiarEstadoUseCase(repo).execute({ user: vendedor, idPublicacion: 7, accion: 'PAUSAR' }), ConflictError);
  });
});
