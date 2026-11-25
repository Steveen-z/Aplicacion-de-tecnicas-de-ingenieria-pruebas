import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: módulo .mjs sin tipos
import { construirScriptCompleto } from '../scripts/db-script-completo.mjs';

const raiz = join(__dirname, '..');
const carpeta = join(raiz, 'db', 'migraciones');

it('db/scriptdb.sql está generado a partir de db/migraciones (npm run db:generar-script)', () => {
  const actual = readFileSync(join(raiz, 'db', 'scriptdb.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(actual, construirScriptCompleto(raiz));
});

it('cada migración tiene número único, guarda de versión, registro y transacción', () => {
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
  const versiones = archivos.map((f) => f.slice(0, 3));
  assert.equal(new Set(versiones).size, versiones.length);
  assert.equal(versiones[0], '001');
  for (const f of archivos) {
    const sql = readFileSync(join(carpeta, f), 'utf8');
    const v = f.slice(0, 3);
    assert.match(f, /^\d{3}_[a-z0-9_]+\.sql$/, f);
    assert.match(sql, /^BEGIN;/m, `${f}: falta BEGIN`);
    assert.match(sql, /^COMMIT;/m, `${f}: falta COMMIT`);
    assert.ok(sql.includes(`WHERE version = '${v}'`), `${f}: falta la guarda de versión`);
    assert.ok(sql.includes(`INSERT INTO schema_migraciones (version, nombre) VALUES ('${v}'`), `${f}: no se registra`);
  }
});
