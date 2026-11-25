import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundError } from '../../../shared/domain/errors';
import { CarpetaArchivos, FileStorage, esRutaArchivoValida } from '../../../shared/domain/file-storage.port';

/**
 * Almacenamiento en disco local (UPLOAD_DIR). Para producción con varias instancias
 * conviene implementar FileStorage sobre S3/Cloudinary: el resto del sistema no cambia.
 */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseDir = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
    const puerto = config.get<string>('PORT') ?? '3000';
    this.baseUrl = (config.get<string>('PUBLIC_BASE_URL') ?? `http://localhost:${puerto}`).replace(/\/+$/, '');
  }

  async guardar(contenido: Buffer, carpeta: CarpetaArchivos, extension: string): Promise<string> {
    const directorio = join(this.baseDir, carpeta);
    await mkdir(directorio, { recursive: true });

    const nombre = `${randomUUID()}.${extension}`;
    await writeFile(join(directorio, nombre), contenido, { flag: 'wx' });
    return `${carpeta}/${nombre}`;
  }

  /** Ruta absoluta dentro de UPLOAD_DIR, o null si la ruta no es válida (anti path-traversal). */
  private rutaSegura(ruta: string): string | null {
    if (!esRutaArchivoValida(ruta)) return null;
    const completa = resolve(this.baseDir, ruta);
    return completa.startsWith(this.baseDir + sep) ? completa : null;
  }

  async leer(ruta: string): Promise<Buffer> {
    const completa = this.rutaSegura(ruta);
    if (!completa) throw new NotFoundError('El archivo no existe');
    try {
      return await readFile(completa);
    } catch {
      throw new NotFoundError('El archivo no existe');
    }
  }

  urlPublica(ruta: string): string | null {
    return ruta.startsWith('imagenes/') ? `${this.baseUrl}/uploads/${ruta}` : null;
  }

  rutaDesdeUrl(url: string): string | null {
    const prefijo = `${this.baseUrl}/uploads/`;
    if (!url.startsWith(prefijo)) return null;
    const ruta = url.slice(prefijo.length);
    return esRutaArchivoValida(ruta) ? ruta : null;
  }

  async eliminar(ruta: string): Promise<void> {
    const completa = this.rutaSegura(ruta);
    if (!completa) return;
    try {
      await unlink(completa);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async *listar(carpeta: CarpetaArchivos): AsyncIterable<{ ruta: string; modificadoEn: Date }> {
    let nombres: string[];
    try {
      nombres = await readdir(join(this.baseDir, carpeta));
    } catch {
      return; // la carpeta aún no existe
    }
    for (const nombre of nombres) {
      const ruta = `${carpeta}/${nombre}`;
      const completa = this.rutaSegura(ruta);
      if (!completa) continue; // ignora lo que no sea un archivo de la API
      try {
        yield { ruta, modificadoEn: (await stat(completa)).mtime };
      } catch {
        // borrado entre readdir y stat
      }
    }
  }
}
