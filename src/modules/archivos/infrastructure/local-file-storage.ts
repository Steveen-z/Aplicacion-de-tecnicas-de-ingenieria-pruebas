import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

  async leer(ruta: string): Promise<Buffer> {
    if (!esRutaArchivoValida(ruta)) throw new NotFoundError('El archivo no existe');

    const completa = resolve(this.baseDir, ruta);
    if (!completa.startsWith(this.baseDir + sep)) throw new NotFoundError('El archivo no existe');

    try {
      return await readFile(completa);
    } catch {
      throw new NotFoundError('El archivo no existe');
    }
  }

  urlPublica(ruta: string): string | null {
    return ruta.startsWith('imagenes/') ? `${this.baseUrl}/uploads/${ruta}` : null;
  }
}
