import { CategoriaArchivo } from './tipo-archivo';
import { ArchivoRegistrado } from './archivo.repository';

export type ProblemaArchivo =
  | { tipo: 'NO_ES_DEL_SISTEMA'; valor: string }
  | { tipo: 'CATEGORIA_INCORRECTA'; valor: string }
  | { tipo: 'AJENO'; valor: string };

/**
 * Comprueba que cada ruta corresponda a un archivo subido por el propio usuario y de la
 * categoría esperada (documento de arquitectura: "validar fotos" y "confirmar cargas").
 * Devuelve el primer problema encontrado (null si todo está bien). Los AJENOS se informan
 * aparte porque son una falta de permiso (403), no un dato mal formado (422).
 */
export function clasificarReferencias(
  idUsuario: number,
  categoria: CategoriaArchivo,
  pedidas: { valor: string; ruta: string | null }[],
  registrados: ArchivoRegistrado[],
): ProblemaArchivo | null {
  const porRuta = new Map(registrados.map((a) => [a.ruta, a]));
  let ajeno: ProblemaArchivo | null = null;
  for (const { valor, ruta } of pedidas) {
    const archivo = ruta ? porRuta.get(ruta) : undefined;
    if (!archivo) return { tipo: 'NO_ES_DEL_SISTEMA', valor };
    if (archivo.categoria !== categoria) return { tipo: 'CATEGORIA_INCORRECTA', valor };
    if (archivo.idUsuario !== idUsuario) ajeno ??= { tipo: 'AJENO', valor };
  }
  return ajeno;
}
