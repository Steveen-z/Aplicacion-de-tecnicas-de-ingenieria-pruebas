import { EstadoPublicacion } from './publicacion';

export interface AvisoBajaPrecio {
  titulo: string;
  mensaje: string;
}

const dinero = (valor: number) =>
  `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * P11 - Decide si un cambio de precio genera aviso a los interesados y con qué texto.
 * Solo una BAJA en una publicación ACTIVA (visible para los compradores) genera aviso.
 * Se evalúa con el precio y el estado leídos bajo bloqueo, dentro de la transacción.
 */
export function decidirAvisoBajaPrecio(datos: {
  titulo: string;
  estado: EstadoPublicacion;
  precioAnterior: number;
  precioNuevo: number;
}): AvisoBajaPrecio | null {
  if (datos.estado !== 'ACTIVA') return null;
  if (Math.round(datos.precioNuevo * 100) >= Math.round(datos.precioAnterior * 100)) return null;
  return {
    titulo: 'Bajó el precio de un inmueble que guardaste',
    mensaje: `"${datos.titulo}" pasó de ${dinero(datos.precioAnterior)} a ${dinero(datos.precioNuevo)}.`,
  };
}
