#!/usr/bin/env node
/**
 * Regenera db/scriptdb.sql concatenando db/migraciones/*.sql en orden.
 * scriptdb.sql es el esquema completo para crear una base nueva de una vez
 * (psql -f o Query Tool de pgAdmin). No se edita a mano: se edita una migración
 * nueva y se ejecuta  npm run db:generar-script
 * La prueba test/esquema.spec.ts falla si scriptdb.sql quedó desactualizado.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirScriptCompleto } from './db-script-completo.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'db', 'scriptdb.sql');
const contenido = construirScriptCompleto(raiz);
const anterior = (() => {
  try {
    return readFileSync(destino, 'utf8');
  } catch {
    return '';
  }
})();
writeFileSync(destino, contenido);
console.log(anterior === contenido ? 'db/scriptdb.sql ya estaba al día.' : 'db/scriptdb.sql regenerado.');
