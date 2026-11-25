import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { SERVICIO_MAPAS, ServicioMapas } from '../domain/servicio-mapas.port';
import { evaluarCercania } from '../domain/ubicacion-cercania';
import { cargarPublicacionVisible } from './acceso';
import { construirVistaDetalle } from './vistas';

const RADIO_PUNTOS_INTERES_M = 2000;

/** P06 - Ver detalle y ubicación de una publicación (galería, mapa, puntos de interés y valoración). */
@Injectable()
export class ObtenerDetalleUseCase {
  constructor(
    @Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository,
    @Inject(SERVICIO_MAPAS) private readonly mapas: ServicioMapas,
  ) {}

  async execute(idPublicacion: number, user?: AuthUser) {
    const { publicacion, privilegiado } = await cargarPublicacionVisible(this.repo, idPublicacion, user);
    const { latitudPublica, longitudPublica } = publicacion.ubicacion;

    // El mapa y los puntos de interés se calculan siempre sobre el punto aproximado.
    const tieneCoordenadas = latitudPublica !== null && longitudPublica !== null;
    const puntos = tieneCoordenadas
      ? await this.mapas.buscarPuntosInteres(latitudPublica, longitudPublica, RADIO_PUNTOS_INTERES_M)
      : null;

    return {
      ...construirVistaDetalle(publicacion, privilegiado),
      mapa: tieneCoordenadas
        ? {
            ...this.mapas.obtenerMapa(latitudPublica, longitudPublica),
            puntosInteres: puntos ?? [],
            puntosInteresDisponibles: puntos !== null,
          }
        : null,
      valoracionUbicacion: evaluarCercania(tieneCoordenadas ? puntos : null),
    };
  }
}
