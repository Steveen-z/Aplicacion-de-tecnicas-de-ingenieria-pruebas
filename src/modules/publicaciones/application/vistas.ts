import { Publicacion } from '../domain/publicacion';

/**
 * Vista de detalle de una publicación. Los datos sensibles (dirección exacta,
 * coordenadas exactas) solo se incluyen para el propietario y el administrador;
 * el resto ve únicamente el punto aproximado. El número de WhatsApp nunca se
 * incluye: se obtiene por el endpoint de contacto (requiere sesión).
 */
export function construirVistaDetalle(publicacion: Publicacion, privilegiado: boolean) {
  const { ubicacion, vendedor } = publicacion;

  return {
    idPublicacion: publicacion.idPublicacion,
    titulo: publicacion.titulo,
    descripcion: publicacion.descripcion,
    tipoOperacion: publicacion.tipoOperacion,
    tipoPropiedad: publicacion.tipoPropiedad,
    precio: publicacion.precio,
    estado: publicacion.estado,
    fechaPublicacion: publicacion.fechaPublicacion,
    fechaActualizacion: publicacion.fechaActualizacion,
    /** Predio (en una CASA, el terreno donde está construida). */
    terreno: publicacion.terreno,
    casa: publicacion.casa,
    ubicacion: {
      departamento: ubicacion.departamento,
      municipio: ubicacion.municipio,
      distrito: ubicacion.distrito,
      latitud: ubicacion.latitudPublica,
      longitud: ubicacion.longitudPublica,
      esAproximada: true,
      ...(privilegiado
        ? {
            direccionDetalle: ubicacion.direccionDetalle,
            latitudExacta: ubicacion.latitud,
            longitudExacta: ubicacion.longitud,
          }
        : {}),
    },
    // El motivo de moderación solo lo ven el dueño y el administrador.
    ...(privilegiado ? { motivoRechazo: publicacion.motivoRechazo } : {}),
    fotografias: publicacion.fotografias,
    vendedor: {
      idVendedor: vendedor.idVendedor,
      nombre: vendedor.nombre,
      verificado: vendedor.estadoVerificacion === 'VERIFICADO',
    },
  };
}

export type VistaDetalle = ReturnType<typeof construirVistaDetalle>;
