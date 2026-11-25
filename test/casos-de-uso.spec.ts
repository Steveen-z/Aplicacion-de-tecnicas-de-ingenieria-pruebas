/**
 * Pruebas unitarias de casos de uso (capa application) con repositorios falsos
 * en memoria: no usan base de datos, red ni NestJS en tiempo de ejecución.
 * Cubren los flujos principales: registro (P02), login, cambio de rol (P03),
 * cambio de precio (P11) y comparación de terrenos (P12).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthUser } from '../src/shared/domain/auth-user';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  UnauthorizedError,
} from '../src/shared/domain/errors';
import { EmitirSesionService } from '../src/modules/auth/application/services/emitir-sesion.service';
import { IniciarSesionUseCase } from '../src/modules/auth/application/use-cases/iniciar-sesion.use-case';
import { RegistrarClienteUseCase } from '../src/modules/auth/application/use-cases/registrar-cliente.use-case';
import { PasswordHasher, TokenService } from '../src/modules/auth/domain/ports';
import { SesionRepository } from '../src/modules/auth/domain/sesion.repository';
import { NuevoUsuario, UsuarioRepository } from '../src/modules/auth/domain/usuario.repository';
import { UsuarioConCredenciales } from '../src/modules/auth/domain/usuario';
import { SolicitarCambioRolUseCase } from '../src/modules/cambio-rol/application/solicitar-cambio-rol.use-case';
import { CambioRolRepository } from '../src/modules/cambio-rol/domain/cambio-rol.repository';
import { DatosVendedorSolicitados, PerfilParaCambioRol } from '../src/modules/cambio-rol/domain/solicitud-cambio-rol';
import { ActualizarPrecioUseCase } from '../src/modules/publicaciones/application/actualizar-precio.use-case';
import { BajaPrecio, BajaPrecioNotifier } from '../src/modules/publicaciones/domain/baja-precio-notifier.port';
import { EstadoPublicacion, Publicacion } from '../src/modules/publicaciones/domain/publicacion';
import { PublicacionRepository } from '../src/modules/publicaciones/domain/publicacion.repository';
import { CrearComparacionUseCase } from '../src/modules/comparaciones/application/comparaciones.use-cases';
import { ComparacionRepository } from '../src/modules/comparaciones/domain/comparacion.repository';
import { TerrenoComparable } from '../src/modules/comparaciones/domain/comparacion';

/** Comprueba que la promesa falla con el tipo de error de dominio esperado y lo devuelve. */
async function rechaza<E extends DomainError>(promesa: Promise<unknown>, tipo: new (...a: never[]) => E): Promise<E> {
  try {
    await promesa;
  } catch (error) {
    assert.ok(error instanceof tipo, `se esperaba ${tipo.name} y llegó ${(error as Error)?.name}: ${(error as Error)?.message}`);
    return error;
  }
  assert.fail(`se esperaba ${tipo.name} y la operación terminó bien`);
}

// ============================================================ Auth: dobles

class HasherFalso implements PasswordHasher {
  comparaciones = 0;
  async hash(plano: string) {
    return `hash:${plano}`;
  }
  async comparar(plano: string, hash: string) {
    this.comparaciones++;
    return hash === `hash:${plano}`;
  }
}

class TokensFalsos implements TokenService {
  private n = 0;
  firmar(idUsuario: number) {
    return `token-${idUsuario}-${++this.n}`;
  }
  verificar(): { idUsuario: number } {
    throw new Error('no se usa');
  }
  hash(token: string) {
    return `sha:${token}`;
  }
}

class SesionesEnMemoria implements SesionRepository {
  creadas: { idUsuario: number; tokenHash: string; fechaExpiracion: Date }[] = [];
  async crear(datos: { idUsuario: number; tokenHash: string; fechaExpiracion: Date }) {
    this.creadas.push(datos);
    return this.creadas.length;
  }
  async buscarActivaPorHash() {
    return null;
  }
  async finalizar() {}
}

class UsuariosEnMemoria implements UsuarioRepository {
  filas: UsuarioConCredenciales[] = [];
  async existePorCorreo(correo: string) {
    return this.filas.some((u) => u.correo === correo);
  }
  async existeDui() {
    return false;
  }
  async crearCliente(d: NuevoUsuario) {
    const fila: UsuarioConCredenciales = {
      idUsuario: this.filas.length + 1,
      nombreCompleto: d.nombreCompleto,
      correo: d.correo,
      telefono: d.telefono,
      telefonoVerificado: false,
      rol: 'CLIENTE',
      estadoCuenta: 'ACTIVA',
      fechaRegistro: new Date(),
      idCliente: this.filas.length + 1,
      idVendedor: null,
      passwordHash: d.passwordHash,
    };
    this.filas.push(fila);
    const { passwordHash: _p, ...publico } = fila;
    return publico;
  }
  async crearVendedor(): Promise<never> {
    throw new Error('no se usa');
  }
  async buscarConCredencialesPorCorreo(correo: string) {
    return this.filas.find((u) => u.correo === correo) ?? null;
  }
  async buscarPorId(id: number) {
    return this.filas.find((u) => u.idUsuario === id) ?? null;
  }
}

function montarAuth() {
  const usuarios = new UsuariosEnMemoria();
  const hasher = new HasherFalso();
  const sesiones = new SesionesEnMemoria();
  const emitir = new EmitirSesionService(new TokensFalsos(), sesiones, 3600);
  return {
    usuarios,
    hasher,
    sesiones,
    registrar: new RegistrarClienteUseCase(usuarios, hasher, emitir),
    login: new IniciarSesionUseCase(usuarios, hasher, emitir),
  };
}

// ============================================================ P02 registro

describe('P02 - RegistrarClienteUseCase', () => {
  it('crea el cliente, guarda solo el hash y abre sesión guardando el hash del token', async () => {
    const { registrar, usuarios, sesiones } = montarAuth();
    const r = await registrar.execute({
      nombreCompleto: '  Ana Pérez ',
      correo: ' Ana@Correo.SV ',
      password: 'Clave12345',
      telefono: '7000-1234',
    });
    assert.equal(r.usuario.rol, 'CLIENTE');
    assert.equal(r.usuario.correo, 'ana@correo.sv');
    assert.equal(r.usuario.nombreCompleto, 'Ana Pérez');
    assert.equal(r.usuario.telefono, '70001234');
    assert.equal('passwordHash' in r.usuario, false);
    assert.notEqual(usuarios.filas[0].passwordHash, 'Clave12345');
    assert.ok(r.token);
    assert.equal(sesiones.creadas.length, 1);
    assert.equal(sesiones.creadas[0].tokenHash, `sha:${r.token}`);
    assert.ok(r.expiraEn.getTime() > Date.now());
  });

  it('rechaza un correo ya registrado (409) sin importar mayúsculas', async () => {
    const { registrar, usuarios } = montarAuth();
    await registrar.execute({ nombreCompleto: 'Ana', correo: 'ana@correo.sv', password: 'Clave12345' });
    await rechaza(
      registrar.execute({ nombreCompleto: 'Otra', correo: 'ANA@correo.sv', password: 'Clave12345' }),
      ConflictError,
    );
    assert.equal(usuarios.filas.length, 1);
  });

  it('rechaza un teléfono inválido (422) sin crear el usuario', async () => {
    const { registrar, usuarios } = montarAuth();
    await rechaza(
      registrar.execute({ nombreCompleto: 'Ana', correo: 'a@b.sv', password: 'Clave12345', telefono: '123' }),
      BusinessRuleError,
    );
    assert.equal(usuarios.filas.length, 0);
  });
});

// ============================================================ Login

describe('Auth - IniciarSesionUseCase', () => {
  it('con credenciales correctas devuelve token y no expone el hash', async () => {
    const { registrar, login } = montarAuth();
    await registrar.execute({ nombreCompleto: 'Ana', correo: 'ana@correo.sv', password: 'Clave12345' });
    const r = await login.execute({ correo: 'ANA@correo.sv', password: 'Clave12345' });
    assert.ok(r.token);
    assert.equal('passwordHash' in r.usuario, false);
  });

  it('contraseña incorrecta o correo inexistente -> 401 con el mismo mensaje', async () => {
    const { registrar, login, hasher } = montarAuth();
    await registrar.execute({ nombreCompleto: 'Ana', correo: 'ana@correo.sv', password: 'Clave12345' });
    const e1 = await rechaza(login.execute({ correo: 'ana@correo.sv', password: 'Otra12345' }), UnauthorizedError);
    const e2 = await rechaza(login.execute({ correo: 'nadie@correo.sv', password: 'Clave12345' }), UnauthorizedError);
    assert.equal(e1.message, e2.message);
    // También se compara contra un hash cuando el correo no existe (evita enumerar cuentas por tiempo).
    assert.equal(hasher.comparaciones, 2);
  });

  it('cuenta bloqueada -> 403 y no abre sesión', async () => {
    const { registrar, login, usuarios, sesiones } = montarAuth();
    await registrar.execute({ nombreCompleto: 'Ana', correo: 'ana@correo.sv', password: 'Clave12345' });
    usuarios.filas[0].estadoCuenta = 'BLOQUEADA';
    await rechaza(login.execute({ correo: 'ana@correo.sv', password: 'Clave12345' }), ForbiddenError);
    assert.equal(sesiones.creadas.length, 1); // solo la del registro
  });
});

// ============================================================ P03 cambio de rol

class CambioRolEnMemoria implements CambioRolRepository {
  aprobados: { idUsuario: number; datos: DatosVendedorSolicitados }[] = [];
  rechazos: { idUsuario: number; pendientes: string[] }[] = [];
  duisUsados = new Set<string>();
  constructor(public perfil: PerfilParaCambioRol | null) {}
  async obtenerPerfil() {
    return this.perfil;
  }
  async duiEnUso(dui: string) {
    return this.duisUsados.has(dui);
  }
  async aprobarCambio(idUsuario: number, datos: DatosVendedorSolicitados) {
    this.aprobados.push({ idUsuario, datos });
    return { idSolicitud: 10, idVendedor: 20 };
  }
  async registrarRechazo(idUsuario: number, pendientes: string[]) {
    this.rechazos.push({ idUsuario, pendientes });
  }
  async listarSolicitudes() {
    return [];
  }
}

const perfilCliente = (telefono: string | null): PerfilParaCambioRol => ({
  idUsuario: 1,
  nombreCompleto: 'Ana Pérez',
  telefono,
  rol: 'CLIENTE',
  idVendedor: null,
});

describe('P03 - SolicitarCambioRolUseCase', () => {
  it('con requisitos completos cambia a VENDEDOR (WhatsApp tomado del teléfono)', async () => {
    const repo = new CambioRolEnMemoria(perfilCliente('7000-1234'));
    const r = await new SolicitarCambioRolUseCase(repo).execute({ idUsuario: 1, dui: '01234567-8' });
    assert.deepEqual(r, { rol: 'VENDEDOR', idVendedor: 20, idSolicitud: 10 });
    assert.equal(repo.aprobados[0].datos.numeroWhatsapp, '70001234');
    assert.equal(repo.rechazos.length, 0);
  });

  it('sin DUI ni teléfono -> 422 con requisitosPendientes, registra el rechazo y no cambia el rol', async () => {
    const repo = new CambioRolEnMemoria(perfilCliente(null));
    const e = await rechaza(new SolicitarCambioRolUseCase(repo).execute({ idUsuario: 1 }), BusinessRuleError);
    const pendientes = (e.details as { requisitosPendientes: string[] }).requisitosPendientes;
    assert.equal(pendientes.length, 3); // teléfono, DUI, WhatsApp
    assert.equal(repo.aprobados.length, 0);
    assert.deepEqual(repo.rechazos[0].pendientes, pendientes);
  });

  it('el cliente sin teléfono puede completarlo en la misma solicitud', async () => {
    const repo = new CambioRolEnMemoria(perfilCliente(null));
    await new SolicitarCambioRolUseCase(repo).execute({ idUsuario: 1, dui: '01234567-8', telefono: '7111 2222' });
    assert.equal(repo.aprobados[0].datos.telefono, '71112222');
    assert.equal(repo.aprobados[0].datos.numeroWhatsapp, '71112222');
  });

  it('DUI usado por otra cuenta -> 422', async () => {
    const repo = new CambioRolEnMemoria(perfilCliente('7000-1234'));
    repo.duisUsados.add('01234567-8');
    const e = await rechaza(
      new SolicitarCambioRolUseCase(repo).execute({ idUsuario: 1, dui: '01234567-8' }),
      BusinessRuleError,
    );
    assert.match(JSON.stringify(e.details), /DUI ya está registrado/);
    assert.equal(repo.aprobados.length, 0);
  });

  it('ya vendedor -> 409; administrador -> 403', async () => {
    const vendedor = new CambioRolEnMemoria({ ...perfilCliente('70001234'), rol: 'VENDEDOR', idVendedor: 3 });
    await rechaza(new SolicitarCambioRolUseCase(vendedor).execute({ idUsuario: 1, dui: '01234567-8' }), ConflictError);
    const admin = new CambioRolEnMemoria({ ...perfilCliente('70001234'), rol: 'ADMIN' });
    await rechaza(new SolicitarCambioRolUseCase(admin).execute({ idUsuario: 1, dui: '01234567-8' }), ForbiddenError);
  });
});

// ============================================================ P11 precio

const vendedorUser = (idVendedor: number, idUsuario = 100): AuthUser => ({
  idUsuario,
  idSesion: 1,
  nombreCompleto: 'Vendedor',
  correo: 'v@v.sv',
  rol: 'VENDEDOR',
  idCliente: idUsuario,
  idVendedor,
});

function publicacion(estado: EstadoPublicacion, precio = 25000): Publicacion {
  return {
    idPublicacion: 7,
    idVendedor: 1,
    titulo: 'Terreno en San Miguel',
    descripcion: 'Terreno plano',
    tipoOperacion: 'VENTA',
    precio,
    estado,
    fechaPublicacion: new Date(),
    fechaActualizacion: new Date(),
    terreno: { idTerreno: 1, areaM2: 500, largoM: null, anchoM: null, tipoTerreno: null, caracteristicas: null },
    ubicacion: {
      departamento: 'San Miguel',
      municipio: 'San Miguel',
      distrito: null,
      direccionDetalle: null,
      latitud: null,
      longitud: null,
      latitudPublica: null,
      longitudPublica: null,
    },
    fotografias: [],
    vendedor: {
      idVendedor: 1,
      idUsuario: 100,
      nombre: 'Vendedor',
      telefono: null,
      numeroWhatsapp: null,
      estadoVerificacion: 'PENDIENTE',
    },
  };
}

/** Solo implementa lo que usa ActualizarPrecioUseCase. */
function repoPrecio(pub: Publicacion) {
  const historial: { anterior: number; nuevo: number }[] = [];
  const repo = {
    async buscarPorId(id: number) {
      return id === pub.idPublicacion ? pub : null;
    },
    async registrarCambioPrecio(_id: number, nuevo: number) {
      const anterior = pub.precio;
      if (anterior === nuevo) return { precioAnterior: anterior, huboCambio: false };
      historial.push({ anterior, nuevo });
      pub.precio = nuevo;
      return { precioAnterior: anterior, huboCambio: true };
    },
  } as unknown as PublicacionRepository;
  return { repo, historial };
}

class NotifierFalso implements BajaPrecioNotifier {
  avisos: BajaPrecio[] = [];
  falla = false;
  async notificar(baja: BajaPrecio) {
    if (this.falla) throw new Error('BD caída');
    this.avisos.push(baja);
    return 2;
  }
}

describe('P11 - ActualizarPrecioUseCase', () => {
  it('baja de precio: registra historial y notifica a interesados excluyendo al vendedor', async () => {
    const { repo, historial } = repoPrecio(publicacion('ACTIVA'));
    const notifier = new NotifierFalso();
    const r = await new ActualizarPrecioUseCase(repo, notifier).execute({
      user: vendedorUser(1),
      idPublicacion: 7,
      nuevoPrecio: 22000,
    });
    assert.deepEqual(r, { idPublicacion: 7, precioAnterior: 25000, precioNuevo: 22000, bajoElPrecio: true, clientesNotificados: 2 });
    assert.deepEqual(historial, [{ anterior: 25000, nuevo: 22000 }]);
    assert.equal(notifier.avisos[0].excluirIdUsuario, 100);
  });

  it('subida de precio o publicación pausada: registra historial pero no notifica', async () => {
    const notifier = new NotifierFalso();
    const sube = repoPrecio(publicacion('ACTIVA'));
    await new ActualizarPrecioUseCase(sube.repo, notifier).execute({ user: vendedorUser(1), idPublicacion: 7, nuevoPrecio: 30000 });
    const pausada = repoPrecio(publicacion('PAUSADA'));
    const r = await new ActualizarPrecioUseCase(pausada.repo, notifier).execute({ user: vendedorUser(1), idPublicacion: 7, nuevoPrecio: 1000 });
    assert.equal(sube.historial.length, 1);
    assert.equal(pausada.historial.length, 1);
    assert.equal(r.clientesNotificados, 0);
    assert.equal(notifier.avisos.length, 0);
  });

  it('precio igual -> 422; publicación vendida -> 422; publicación ajena -> 403', async () => {
    const igual = repoPrecio(publicacion('ACTIVA'));
    await rechaza(
      new ActualizarPrecioUseCase(igual.repo, new NotifierFalso()).execute({ user: vendedorUser(1), idPublicacion: 7, nuevoPrecio: 25000 }),
      BusinessRuleError,
    );
    const vendida = repoPrecio(publicacion('VENDIDA'));
    await rechaza(
      new ActualizarPrecioUseCase(vendida.repo, new NotifierFalso()).execute({ user: vendedorUser(1), idPublicacion: 7, nuevoPrecio: 1 }),
      BusinessRuleError,
    );
    const ajena = repoPrecio(publicacion('ACTIVA'));
    await rechaza(
      new ActualizarPrecioUseCase(ajena.repo, new NotifierFalso()).execute({ user: vendedorUser(2, 200), idPublicacion: 7, nuevoPrecio: 1 }),
      ForbiddenError,
    );
    assert.equal(vendida.historial.length + ajena.historial.length, 0);
  });

  it('si fallan las notificaciones el cambio de precio se mantiene', async () => {
    const { repo, historial } = repoPrecio(publicacion('ACTIVA'));
    const notifier = new NotifierFalso();
    notifier.falla = true;
    const uc = new ActualizarPrecioUseCase(repo, notifier);
    (uc as unknown as { logger: { error: () => void } }).logger = { error: () => {} }; // silencia el log esperado
    const r = await uc.execute({ user: vendedorUser(1), idPublicacion: 7, nuevoPrecio: 20000 });
    assert.equal(r.clientesNotificados, 0);
    assert.equal(historial.length, 1);
  });
});

// ============================================================ P12 comparación

const terreno = (id: number, precio: number, area: number, extra: Partial<TerrenoComparable> = {}): TerrenoComparable => ({
  idPublicacion: id,
  titulo: `Terreno ${id}`,
  tipoOperacion: 'VENTA',
  precio,
  estado: 'ACTIVA',
  disponible: true,
  areaM2: area,
  largoM: null,
  anchoM: null,
  tipoTerreno: null,
  caracteristicas: null,
  departamento: 'San Miguel',
  municipio: 'San Miguel',
  distrito: null,
  portadaUrl: null,
  precioPorM2: Math.round((precio / area) * 100) / 100,
  ...extra,
});

class ComparacionesEnMemoria implements ComparacionRepository {
  guardadas: { idCliente: number; ids: number[] }[] = [];
  constructor(private readonly terrenos: TerrenoComparable[]) {}
  async obtenerTerrenos(ids: number[]) {
    return ids.flatMap((id) => this.terrenos.filter((t) => t.idPublicacion === id));
  }
  async crear(idCliente: number, ids: number[]) {
    this.guardadas.push({ idCliente, ids });
    return { idComparacion: this.guardadas.length, fechaCreacion: new Date(), idsPublicaciones: ids };
  }
  async buscarPorId() {
    return null;
  }
  async listar() {
    return [];
  }
}

const clienteUser: AuthUser = {
  idUsuario: 5,
  idSesion: 1,
  nombreCompleto: 'Cliente',
  correo: 'c@c.sv',
  rol: 'CLIENTE',
  idCliente: 9,
  idVendedor: null,
};

describe('P12 - CrearComparacionUseCase', () => {
  const base = [
    terreno(1, 20000, 400), // 50 $/m²
    terreno(2, 15000, 500), // 30 $/m²
    terreno(3, 30000, 1000), // 30 $/m² empatado, mayor área
    terreno(4, 300, 800, { tipoOperacion: 'RENTA' }),
    terreno(5, 10000, 200, { estado: 'PAUSADA', disponible: false }),
  ];

  it('compara 3 terrenos de venta, guarda la comparación y calcula el resumen', async () => {
    const repo = new ComparacionesEnMemoria(base);
    const r = await new CrearComparacionUseCase(repo).execute({ user: clienteUser, idsPublicaciones: [1, 2, 3, 2] });
    assert.deepEqual(repo.guardadas, [{ idCliente: 9, ids: [1, 2, 3] }]);
    assert.equal(r.terrenos.length, 3);
    assert.deepEqual(r.resumen, { menorPrecio: 2, mayorArea: 3, menorPrecioPorM2: 2 });
  });

  it('1 terreno o más de 4 -> 422 sin guardar', async () => {
    const repo = new ComparacionesEnMemoria(base);
    const uc = new CrearComparacionUseCase(repo);
    await rechaza(uc.execute({ user: clienteUser, idsPublicaciones: [1] }), BusinessRuleError);
    await rechaza(uc.execute({ user: clienteUser, idsPublicaciones: [1, 2, 3, 4, 5] }), BusinessRuleError);
    assert.equal(repo.guardadas.length, 0);
  });

  it('venta vs renta -> 422; terreno pausado o inexistente -> 422 con idsNoDisponibles', async () => {
    const repo = new ComparacionesEnMemoria(base);
    const uc = new CrearComparacionUseCase(repo);
    await rechaza(uc.execute({ user: clienteUser, idsPublicaciones: [1, 4] }), BusinessRuleError);
    const e = await rechaza(uc.execute({ user: clienteUser, idsPublicaciones: [1, 5, 99] }), BusinessRuleError);
    assert.deepEqual(e.details, { idsNoDisponibles: [5, 99] });
    assert.equal(repo.guardadas.length, 0);
  });

  it('usuario sin perfil de cliente -> 403', async () => {
    const uc = new CrearComparacionUseCase(new ComparacionesEnMemoria(base));
    await rechaza(uc.execute({ user: { ...clienteUser, idCliente: null }, idsPublicaciones: [1, 2] }), ForbiddenError);
  });
});
