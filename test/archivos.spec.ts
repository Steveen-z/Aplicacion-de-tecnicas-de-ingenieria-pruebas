/**
 * Archivos: propiedad de imágenes/documentos, subida con registro y limpieza de huérfanos.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { BusinessRuleError, ForbiddenError } from '../src/shared/domain/errors';
import { CarpetaArchivos, FileStorage } from '../src/shared/domain/file-storage.port';
import { ArchivoRegistrado, ArchivoRepository } from '../src/modules/archivos/domain/archivo.repository';
import { clasificarReferencias } from '../src/modules/archivos/domain/propiedad-archivos';
import { ResolverArchivosService } from '../src/modules/archivos/application/resolver-archivos.service';
import { SubirArchivoUseCase } from '../src/modules/archivos/application/subir-archivo.use-case';
import { LimpiarArchivosUseCase } from '../src/modules/archivos/application/limpiar-archivos.use-case';
import { LocalFileStorage } from '../src/modules/archivos/infrastructure/local-file-storage';
import { leerOpciones } from '../src/cli/limpiar-archivos';

const U1 = 'imagenes/11111111-1111-4111-8111-111111111111.jpg';
const U2 = 'imagenes/22222222-2222-4222-8222-222222222222.png';
const DOC = 'documentos/33333333-3333-4333-8333-333333333333.pdf';
const BASE = 'http://localhost:3000/uploads/';
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe('clasificarReferencias', () => {
  const reg: ArchivoRegistrado[] = [
    { ruta: U1, idUsuario: 1, categoria: 'IMAGEN' },
    { ruta: U2, idUsuario: 2, categoria: 'IMAGEN' },
    { ruta: DOC, idUsuario: 1, categoria: 'DOCUMENTO' },
  ];
  it('propia OK; externa, no registrada o de otra categoría -> problema de datos; de otro usuario -> AJENO', () => {
    assert.equal(clasificarReferencias(1, 'IMAGEN', [{ valor: 'a', ruta: U1 }], reg), null);
    assert.equal(clasificarReferencias(1, 'IMAGEN', [{ valor: 'http://otro.com/x.jpg', ruta: null }], reg)?.tipo, 'NO_ES_DEL_SISTEMA');
    assert.equal(clasificarReferencias(1, 'IMAGEN', [{ valor: DOC, ruta: DOC }], reg)?.tipo, 'CATEGORIA_INCORRECTA');
    assert.equal(clasificarReferencias(1, 'IMAGEN', [{ valor: U2, ruta: U2 }], reg)?.tipo, 'AJENO');
    // Un problema de datos tiene prioridad sobre uno de permiso, para no revelar a quién pertenece.
    assert.equal(clasificarReferencias(1, 'IMAGEN', [{ valor: U2, ruta: U2 }, { valor: 'x', ruta: null }], reg)?.tipo, 'NO_ES_DEL_SISTEMA');
  });
});

// ------------------------------------------------------------ Dobles

class RepoArchivosFalso implements ArchivoRepository {
  filas = new Map<string, ArchivoRegistrado & { fecha: Date; id: number }>();
  referenciadas = new Set<string>();
  fallarRegistro = false;
  private n = 0;
  agregar(ruta: string, idUsuario: number, categoria: 'IMAGEN' | 'DOCUMENTO', fecha: Date) {
    this.filas.set(ruta, { ruta, idUsuario, categoria, fecha, id: ++this.n });
  }
  async registrar(a: ArchivoRegistrado) {
    if (this.fallarRegistro) throw new Error('BD caída');
    this.agregar(a.ruta, a.idUsuario, a.categoria, new Date());
  }
  async buscarPorRutas(rutas: string[]) {
    return rutas.flatMap((r) => (this.filas.has(r) ? [this.filas.get(r)!] : []));
  }
  async listarAntiguos(corte: Date, despuesDeId: number, limite: number) {
    return [...this.filas.values()]
      .filter((f) => f.fecha < corte && f.id > despuesDeId)
      .sort((a, b) => a.id - b.id)
      .slice(0, limite)
      .map((f) => ({ idArchivo: f.id, ruta: f.ruta }));
  }
  async eliminarSiSinReferenciaSimulado(ruta: string, corte: Date) {
    const f = this.filas.get(ruta);
    return !!f && f.fecha < corte && !this.referenciadas.has(ruta);
  }
  async eliminarSiSinReferencia(ruta: string, corte: Date) {
    const ok = await this.eliminarSiSinReferenciaSimulado(ruta, corte);
    if (ok) this.filas.delete(ruta);
    return ok;
  }
  async rutasRegistradas(rutas: string[]) {
    return new Set(rutas.filter((r) => this.filas.has(r)));
  }
}

class StorageFalso implements FileStorage {
  disco = new Map<string, Date>();
  borrados: string[] = [];
  async guardar(_c: Buffer, carpeta: CarpetaArchivos, ext: string) {
    const ruta = `${carpeta}/44444444-4444-4444-8444-444444444444.${ext}`;
    this.disco.set(ruta, new Date());
    return ruta;
  }
  async leer(): Promise<Buffer> {
    return Buffer.alloc(0);
  }
  urlPublica(ruta: string) {
    return ruta.startsWith('imagenes/') ? BASE + ruta : null;
  }
  rutaDesdeUrl(url: string) {
    return url.startsWith(BASE) ? url.slice(BASE.length) : null;
  }
  async eliminar(ruta: string) {
    this.disco.delete(ruta);
    this.borrados.push(ruta);
  }
  async *listar(carpeta: CarpetaArchivos) {
    for (const [ruta, modificadoEn] of this.disco) if (ruta.startsWith(carpeta)) yield { ruta, modificadoEn };
  }
}

const hace = (horas: number) => new Date(Date.now() - horas * 3600_000);

// ------------------------------------------------------------ Resolver

describe('ResolverArchivosService', () => {
  const montar = () => {
    const repo = new RepoArchivosFalso();
    repo.agregar(U1, 1, 'IMAGEN', new Date());
    repo.agregar(U2, 2, 'IMAGEN', new Date());
    repo.agregar(DOC, 1, 'DOCUMENTO', new Date());
    return new ResolverArchivosService(repo, new StorageFalso());
  };
  it('devuelve la clave del objeto de imágenes propias (repetidas permitidas)', async () => {
    assert.deepEqual(await montar().resolverImagenes(1, [BASE + U1, BASE + U1]), [
      { urlImagen: BASE + U1, ruta: U1 },
      { urlImagen: BASE + U1, ruta: U1 },
    ]);
  });
  it('URL externa o documento como foto -> 422; imagen de otro usuario -> 403', async () => {
    const s = montar();
    await assert.rejects(s.resolverImagenes(1, ['https://otro.com/x.jpg']), BusinessRuleError);
    await assert.rejects(s.resolverImagenes(1, [BASE + DOC]), BusinessRuleError);
    await assert.rejects(s.resolverImagenes(1, [BASE + U2]), ForbiddenError);
  });
  it('documento: propio OK; de otro usuario -> 403; imagen como documento -> 422', async () => {
    const s = montar();
    await s.verificarDocumento(1, DOC);
    await assert.rejects(s.verificarDocumento(2, DOC), ForbiddenError);
    await assert.rejects(s.verificarDocumento(1, U1), BusinessRuleError);
  });
});

// ------------------------------------------------------------ Subida

describe('SubirArchivoUseCase', () => {
  it('guarda el archivo y lo registra con su dueño', async () => {
    const repo = new RepoArchivosFalso();
    const storage = new StorageFalso();
    const r = await new SubirArchivoUseCase(storage, repo).execute({ idUsuario: 7, contenido: JPG, categoria: 'IMAGEN' });
    assert.equal(repo.filas.get(r.ruta)?.idUsuario, 7);
    assert.equal(r.url, BASE + r.ruta);
  });
  it('si falla el registro, borra el archivo guardado (compensación) y propaga el error', async () => {
    const repo = new RepoArchivosFalso();
    repo.fallarRegistro = true;
    const storage = new StorageFalso();
    await assert.rejects(new SubirArchivoUseCase(storage, repo).execute({ idUsuario: 7, contenido: JPG, categoria: 'IMAGEN' }), /BD caída/);
    assert.equal(storage.disco.size, 0);
  });
});

// ------------------------------------------------------------ Limpieza

describe('LimpiarArchivosUseCase', () => {
  const montar = () => {
    const repo = new RepoArchivosFalso();
    const storage = new StorageFalso();
    repo.agregar(U1, 1, 'IMAGEN', hace(48)); // viejo sin uso -> se borra
    storage.disco.set(U1, hace(48));
    repo.agregar(U2, 1, 'IMAGEN', hace(48)); // viejo en uso -> se conserva
    storage.disco.set(U2, hace(48));
    repo.referenciadas.add(U2);
    repo.agregar(DOC, 1, 'DOCUMENTO', hace(1)); // reciente sin uso -> se conserva (aún no entra al barrido)
    storage.disco.set(DOC, hace(1));
    const huerfanoDisco = 'imagenes/55555555-5555-4555-8555-555555555555.webp'; // en disco sin fila
    storage.disco.set(huerfanoDisco, hace(30));
    return { repo, storage, uc: new LimpiarArchivosUseCase(repo, storage), huerfanoDisco };
  };

  it('borra registros viejos sin uso y archivos de disco sin registro; conserva usados y recientes', async () => {
    const { repo, storage, uc, huerfanoDisco } = montar();
    const r = await uc.execute({ simulacion: false });
    assert.deepEqual(r, { revisados: 3, borrados: 2, conservados: 1, errores: 0, simulacion: false });
    assert.deepEqual(storage.borrados.sort(), [U1, huerfanoDisco].sort());
    assert.ok(repo.filas.has(U2) && repo.filas.has(DOC) && !repo.filas.has(U1));
  });

  it('simulación no toca nada pero informa lo mismo; repetir tras limpiar no borra más', async () => {
    const { repo, storage, uc } = montar();
    const sim = await uc.execute({ simulacion: true });
    assert.equal(sim.borrados, 2);
    assert.equal(storage.borrados.length, 0);
    assert.equal(repo.filas.size, 3);
    await uc.execute({ simulacion: false });
    const otra = await uc.execute({ simulacion: false });
    assert.equal(otra.borrados, 0);
  });

  it('un error al borrar un archivo se cuenta y no detiene el resto', async () => {
    const { storage, uc } = montar();
    storage.eliminar = async (ruta: string) => {
      if (ruta === U1) throw new Error('disco');
      storage.disco.delete(ruta);
    };
    const r = await uc.execute({ simulacion: false });
    assert.equal(r.errores, 1);
    assert.equal(r.borrados, 1);
  });

  it('opciones del CLI', () => {
    assert.deepEqual(leerOpciones([]), { simulacion: false, antiguedadHoras: 24 });
    assert.deepEqual(leerOpciones(['--simulacion', '--horas', '48']), { simulacion: true, antiguedadHoras: 48 });
    assert.throws(() => leerOpciones(['--horas', '0']));
  });
});

// ------------------------------------------------------------ Almacenamiento local

describe('LocalFileStorage', () => {
  it('rutaDesdeUrl solo acepta URLs propias con ruta válida; eliminar no sale de UPLOAD_DIR', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'inmobisv-'));
    try {
      const config = { get: (k: string) => ({ UPLOAD_DIR: dir, PUBLIC_BASE_URL: 'http://localhost:3000' })[k] } as unknown as ConfigService;
      const s = new LocalFileStorage(config);
      assert.equal(s.rutaDesdeUrl(BASE + U1), U1);
      assert.equal(s.rutaDesdeUrl('https://evil.example/uploads/' + U1), null);
      assert.equal(s.rutaDesdeUrl(BASE + 'imagenes/../../etc/passwd'), null);
      assert.equal(s.rutaDesdeUrl(BASE + 'imagenes/a.jpg'), null);

      const ruta = await s.guardar(JPG, 'imagenes', 'jpg');
      const listados: string[] = [];
      for await (const f of s.listar('imagenes')) listados.push(f.ruta);
      assert.deepEqual(listados, [ruta]);
      mkdirSync(join(dir, 'secreto'));
      writeFileSync(join(dir, 'secreto', 'x'), 'no borrar');
      await s.eliminar('../secreto/x');
      assert.ok(existsSync(join(dir, 'secreto', 'x')));
      await s.eliminar(ruta);
      await s.eliminar(ruta); // ya no existe: no falla
      assert.ok(!existsSync(join(dir, ruta)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
