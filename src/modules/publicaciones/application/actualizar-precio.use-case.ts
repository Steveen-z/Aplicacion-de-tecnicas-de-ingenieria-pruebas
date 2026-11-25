import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { decidirAvisoBajaPrecio } from '../domain/baja-precio';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { puedeEditarse } from '../domain/publicacion.rules';
import { cargarPublicacionPropia } from './acceso';

export interface ResultadoActualizacionPrecio {
  idPublicacion: number;
  precioAnterior: number;
  precioNuevo: number;
  bajoElPrecio: boolean;
  clientesNotificados: number;
}

/**
 * P11 - Actualizar el precio y notificar la baja a los interesados.
 * Precio, historial y avisos se guardan en una sola transacción: si falla cualquiera,
 * no queda nada a medias (documento de arquitectura: "Precio y avisos").
 */
@Injectable()
export class ActualizarPrecioUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: {
    user: AuthUser;
    idPublicacion: number;
    nuevoPrecio: number;
  }): Promise<ResultadoActualizacionPrecio> {
    const publicacion = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);
    if (!puedeEditarse(publicacion.estado)) {
      throw new BusinessRuleError('No se puede cambiar el precio de una publicación vendida, rentada o rechazada');
    }

    const { precioAnterior, huboCambio, avisosCreados } = await this.repo.registrarCambioPrecio(
      publicacion.idPublicacion,
      input.nuevoPrecio,
      {
        excluirIdUsuario: input.user.idUsuario,
        decidir: (datos) => decidirAvisoBajaPrecio({ ...datos, precioNuevo: input.nuevoPrecio }),
      },
    );
    if (!huboCambio) {
      throw new BusinessRuleError('El nuevo precio es igual al precio actual');
    }

    return {
      idPublicacion: publicacion.idPublicacion,
      precioAnterior,
      precioNuevo: input.nuevoPrecio,
      bajoElPrecio: input.nuevoPrecio < precioAnterior,
      clientesNotificados: avisosCreados,
    };
  }
}
