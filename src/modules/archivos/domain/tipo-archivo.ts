export type ExtensionArchivo = 'jpg' | 'png' | 'webp' | 'pdf';
export type CategoriaArchivo = 'IMAGEN' | 'DOCUMENTO';

export const MIME_POR_EXTENSION: Record<ExtensionArchivo, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const PERMITIDAS: Record<CategoriaArchivo, ExtensionArchivo[]> = {
  IMAGEN: ['jpg', 'png', 'webp'],
  DOCUMENTO: ['pdf', 'jpg', 'png'],
};

/**
 * Identifica el tipo real por los primeros bytes (firma del archivo), sin fiarse del
 * nombre ni del Content-Type que declara el cliente.
 */
export function detectarExtension(contenido: Buffer): ExtensionArchivo | null {
  if (contenido.length >= 3 && contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff) {
    return 'jpg';
  }
  if (
    contenido.length >= 8 &&
    contenido.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    contenido.length >= 12 &&
    contenido.subarray(0, 4).toString('ascii') === 'RIFF' &&
    contenido.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (contenido.length >= 4 && contenido.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'pdf';
  }
  return null;
}

export function extensionPermitida(categoria: CategoriaArchivo, extension: ExtensionArchivo): boolean {
  return PERMITIDAS[categoria].includes(extension);
}

export function descripcionPermitidos(categoria: CategoriaArchivo): string {
  return PERMITIDAS[categoria].join(', ').toUpperCase();
}
