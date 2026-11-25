export interface PublicacionParaFavorito {
  idPublicacion: number;
  estado: string;
  precio: number;
}

export interface FavoritoVista {
  idFavorito: number;
  idPublicacion: number;
  fechaGuardado: Date;
  precioAlGuardar: number;
  precioActual: number;
  /** precioActual - precioAlGuardar (negativo = bajó de precio). */
  variacion: number;
  bajoDePrecio: boolean;
  publicacion: {
    titulo: string;
    estado: string;
    tipoOperacion: string;
    areaM2: number;
    departamento: string;
    municipio: string;
    portadaUrl: string | null;
  };
}
