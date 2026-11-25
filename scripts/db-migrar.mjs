#!/usr/bin/env node
/**
 * Aplica en orden las migraciones pendientes de db/migraciones/ usando psql.
 *
 *   npm run db:migrar                 aplica las pendientes
 *   npm run db:migrar -- --estado     solo muestra aplicadas y pendientes
 *   npm run db:migrar -- --baseline 001
 *        marca 001 como aplicada en una base creada con el scriptdb.sql antiguo (v1.0.0)
 *
 * Requiere psql en el PATH y DATABASE_URL en .env (la misma que usa la API).
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migraciones');
const PATRON = /^(\d{3})_[a-z0-9_]+\.sql$/;

function urlParaPsql() {
  const valor = process.env.DATABASE_URL;
  if (!valor) salir('DATABASE_URL no está definida (revisa el archivo .env)');
  const url = new URL(valor);
  url.searchParams.delete('schema'); // parámetro de Prisma que libpq no acepta
  return url.toString();
}

function salir(mensaje, codigo = 1) {
  console.error(`db:migrar: ${mensaje}`);
  process.exit(codigo);
}

function psql(url, args, { silencioso = false } = {}) {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args], {
    encoding: 'utf8',
    stdio: silencioso ? 'pipe' : ['ignore', 'inherit', 'pipe'],
  });
  if (r.error) {
    salir(
      r.error.code === 'ENOENT'
        ? 'no se encontró psql. Agrega la carpeta bin de PostgreSQL al PATH (p. ej. C:\\Program Files\\PostgreSQL\\16\\bin)'
        : r.error.message,
    );
  }
  return r;
}

function versionesAplicadas(url) {
  const r = psql(
    url,
    ['-Atc', "SELECT version FROM schema_migraciones WHERE to_regclass('public.schema_migraciones') IS NOT NULL ORDER BY 1"],
    { silencioso: true },
  );
  if (r.status !== 0) {
    if (/schema_migraciones/.test(r.stderr) && /no existe|does not exist/.test(r.stderr)) return new Set();
    salir(`no se pudo consultar la base de datos:\n${r.stderr.trim()}`);
  }
  return new Set(r.stdout.split(/\r?\n/).filter(Boolean));
}

function migraciones() {
  return readdirSync(CARPETA)
    .filter((f) => PATRON.test(f))
    .sort()
    .map((archivo) => ({ archivo, version: PATRON.exec(archivo)[1] }));
}

const url = urlParaPsql();
const args = process.argv.slice(2);
const todas = migraciones();

if (args[0] === '--baseline') {
  const version = args[1];
  const m = todas.find((x) => x.version === version);
  if (!m) salir(`no existe la migración ${version}`);
  const nombre = m.archivo.replace(/^\d{3}_|\.sql$/g, '');
  const r = psql(url, [
    '-c',
    `CREATE TABLE IF NOT EXISTS schema_migraciones (version VARCHAR(10) PRIMARY KEY, nombre VARCHAR(100) NOT NULL, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now(), aplicada_por TEXT NOT NULL DEFAULT current_user);
     INSERT INTO schema_migraciones (version, nombre) VALUES ('${version}', '${nombre}') ON CONFLICT (version) DO NOTHING;`,
  ]);
  if (r.status !== 0) salir(r.stderr.trim());
  console.log(`Migración ${version} marcada como aplicada (baseline).`);
  process.exit(0);
}

const aplicadas = versionesAplicadas(url);
const pendientes = todas.filter((m) => !aplicadas.has(m.version));

if (args[0] === '--estado') {
  for (const m of todas) console.log(`${aplicadas.has(m.version) ? 'aplicada ' : 'PENDIENTE'}  ${m.archivo}`);
  process.exit(0);
}

if (aplicadas.size === 0 && pendientes.length > 0) {
  // Base creada con el scriptdb.sql de v1.0.0 (sin schema_migraciones): avisar en lugar de fallar con "ya existe".
  const r = psql(url, ['-Atc', "SELECT to_regclass('public.usuarios') IS NOT NULL"], { silencioso: true });
  if (r.stdout.trim() === 't') {
    salir(
      'la base ya tiene tablas pero no registra migraciones (se creó con el scriptdb.sql de v1.0.0).\n' +
        '  Ejecuta primero: npm run db:migrar -- --baseline 001',
    );
  }
}

if (pendientes.length === 0) {
  console.log('La base de datos está al día. No hay migraciones pendientes.');
  process.exit(0);
}

for (const m of pendientes) {
  process.stdout.write(`Aplicando ${m.archivo} ... `);
  const r = psql(url, ['-f', join(CARPETA, m.archivo)], { silencioso: true });
  if (r.status !== 0) {
    console.log('ERROR');
    salir(`falló ${m.archivo}; no se aplicó nada de esa migración:\n${r.stderr.trim()}`);
  }
  console.log('ok');
}
console.log(`${pendientes.length} migración(es) aplicada(s).`);
