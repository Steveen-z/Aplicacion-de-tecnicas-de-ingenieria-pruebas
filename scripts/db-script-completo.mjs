import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PATRON = /^\d{3}_[a-z0-9_]+\.sql$/;

/** Devuelve el contenido de db/scriptdb.sql: todas las migraciones en orden. */
export function construirScriptCompleto(raiz) {
  const carpeta = join(raiz, 'db', 'migraciones');
  const archivos = readdirSync(carpeta).filter((f) => PATRON.test(f)).sort();
  const partes = archivos.map(
    (f) => `-- >>>>>>>>>>>>>>>>>>>> ${f}\n\n${readFileSync(join(carpeta, f), 'utf8').replace(/\r\n/g, '\n').trimEnd()}\n`,
  );
  return `-- ============================================================
-- BASE DE DATOS: InmobiSV - plataforma de comercializacion de inmuebles
-- Motor: PostgreSQL 16 (+ PostGIS desde la migracion 002)
--
-- ARCHIVO GENERADO: no editar a mano. Es la concatenacion de
-- db/migraciones/*.sql (${archivos.length} migraciones). Para cambiar el esquema, crea una
-- migracion nueva y ejecuta: npm run db:generar-script
--
-- Uso en una base NUEVA (vacia):
--   psql -U postgres -c "CREATE DATABASE plataforma_terrenos;"
--   psql -U postgres -d plataforma_terrenos -v ON_ERROR_STOP=1 -f db/scriptdb.sql
-- Para una base existente usa: npm run db:migrar
-- ============================================================

${partes.join('\n')}`;
}
