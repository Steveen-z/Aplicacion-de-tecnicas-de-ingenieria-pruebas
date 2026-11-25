import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PATRON = /^(\d{3})_[a-z0-9_]+\.sql$/;

/**
 * Versiones de migración que esta versión del código necesita: las de db/migraciones/.
 * Si la carpeta no está (p. ej. un despliegue que solo copia dist/), devuelve null y no se comprueba.
 */
export function migracionesRequeridas(carpeta = resolve(process.cwd(), 'db', 'migraciones')): string[] | null {
  try {
    return readdirSync(carpeta)
      .map((f) => PATRON.exec(f)?.[1])
      .filter((v): v is string => v !== undefined)
      .sort();
  } catch {
    return null;
  }
}

export function migracionesPendientes(requeridas: string[] | null, aplicadas: string[]): string[] {
  if (requeridas === null) return [];
  const hechas = new Set(aplicadas);
  return requeridas.filter((v) => !hechas.has(v));
}
