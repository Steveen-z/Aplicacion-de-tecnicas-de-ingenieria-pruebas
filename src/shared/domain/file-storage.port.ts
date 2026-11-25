export const FILE_STORAGE = Symbol('FILE_STORAGE');

export type CarpetaArchivos = 'imagenes' | 'documentos';

/** "imagenes/<uuid>.jpg" o "documentos/<uuid>.pdf": es lo único que se guarda en la base. */
const RUTA_ARCHIVO_REGEX =
  /^(imagenes|documentos)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

export function esRutaArchivoValida(ruta: string, carpeta?: CarpetaArchivos): boolean {
  return RUTA_ARCHIVO_REGEX.test(ruta) && (carpeta === undefined || ruta.startsWith(`${carpeta}/`));
}

export interface FileStorage {
  /** Guarda el archivo con un nombre generado (UUID) y devuelve la ruta relativa. */
  guardar(contenido: Buffer, carpeta: CarpetaArchivos, extension: string): Promise<string>;
  /** Lee un archivo por su ruta relativa. Lanza NotFoundError si no existe o la ruta no es válida. */
  leer(ruta: string): Promise<Buffer>;
  /** URL pública de la imagen, o null si la carpeta es privada (documentos). */
  urlPublica(ruta: string): string | null;
}
