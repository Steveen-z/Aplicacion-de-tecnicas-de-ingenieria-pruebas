import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { BAJA_PRECIO_NOTIFIER, BajaPrecioNotifier } from '../domain/baja-precio-notifier.port';
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

/** P11 - Actualizar el precio y notificar la baja a los interesados. */
@Injectable()
export class ActualizarPrecioUseCase {
  private readonly logger = new Logger(ActualizarPrecioUseCase.name);

  constructor(
    @Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository,
    @Inject(BAJA_PRECIO_NOTIFIER) private readonly notifier: BajaPrecioNotifier,
  ) {}

  async execute(input: {
    user: AuthUser;
    idPublicacion: number;
    nuevoPrecio: number;
  }): Promise<ResultadoActualizacionPrecio> {
    const publicacion = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);

    if (!puedeEditarse(publicacion.estado)) {
      throw new BusinessRuleError('No se puede cambiar el precio de una publicación vendida, rentada o rechazada');
    }

    // Precio + historial en una transacción (nota 5 del script de base de datos).
    const { precioAnterior, huboCambio } = await this.repo.registrarCambioPrecio(
      publicacion.idPublicacion,
      input.nuevoPrecio,
    );
    if (!huboCambio) {
      throw new BusinessRuleError('El nuevo precio es igual al precio actual');
    }

    const bajoElPrecio = input.nuevoPrecio < precioAnterior;
    let clientesNotificados = 0;

    // Solo se notifica una baja en una publicación visible para los compradores.
    if (bajoElPrecio && publicacion.estado === 'ACTIVA') {
      try {
        clientesNotificados = await this.notifier.notificar({
          idPublicacion: publicacion.idPublicacion,
          titulo: publicacion.titulo,
          precioAnterior,
          precioNuevo: input.nuevoPrecio,
          excluirIdUsuario: input.user.idUsuario,
        });
      } catch (error) {
        // El precio ya quedó guardado: un fallo al notificar no debe revertir ni ocultar el cambio.
        this.logger.error(
          `No se pudieron enviar las notificaciones de baja de precio de la publicación ${publicacion.idPublicacion}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return {
      idPublicacion: publicacion.idPublicacion,
      precioAnterior,
      precioNuevo: input.nuevoPrecio,
      bajoElPrecio,
      clientesNotificados,
    };
  }
}
