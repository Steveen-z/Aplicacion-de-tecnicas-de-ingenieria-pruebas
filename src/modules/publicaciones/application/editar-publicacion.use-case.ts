import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { DatosCasa, DatosTerreno, Publicacion } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { aproximarCoordenadas, puedeEditarse, validarDatosPorTipo, validarParCoordenadas } from '../domain/publicacion.rules';
import { cargarPublicacionPropia } from './acceso';

export interface EditarPublicacionInput {
  user: AuthUser;
  idPublicacion: number;
  titulo?: string;
  descripcion?: string;
  terreno?: Partial<DatosTerreno>;
  /** Solo en publicaciones CASA. El tipo de inmueble no se edita. */
  casa?: Partial<DatosCasa>;
  ubicacion?: {
    departamento?: string;
    municipio?: string;
    distrito?: string;
    direccionDetalle?: string;
    latitud?: number;
    longitud?: number;
  };
}

/**
 * P09 (acción "editar"). El precio no se edita aquí: tiene su propio flujo (P11)
 * porque cada cambio debe quedar en el historial y puede generar notificaciones.
 */
@Injectable()
export class EditarPublicacionUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: EditarPublicacionInput): Promise<Publicacion> {
    const actual = await cargarPublicacionPropia(this.repo, input.idPublicacion, input.user);

    if (!puedeEditarse(actual.estado)) {
      throw new BusinessRuleError('Una publicación vendida, rentada o rechazada ya no se puede editar');
    }

    if (input.casa) {
      if (actual.tipoPropiedad !== 'CASA') validarDatosPorTipo(actual.tipoPropiedad, input.casa);
      // Una casa conserva sus datos obligatorios tras la edición.
      validarDatosPorTipo('CASA', { ...actual.casa, ...input.casa });
    }
    const { ubicacion } = input;
    if (ubicacion) validarParCoordenadas(ubicacion.latitud, ubicacion.longitud);

    return this.repo.actualizar(input.idPublicacion, {
      titulo: input.titulo?.trim(),
      descripcion: input.descripcion?.trim(),
      terreno: input.terreno,
      casa: input.casa,
      ubicacion: ubicacion
        ? {
            ...ubicacion,
            ...(ubicacion.latitud !== undefined && ubicacion.longitud !== undefined
              ? aproximarCoordenadas(ubicacion.latitud, ubicacion.longitud)
              : {}),
          }
        : undefined,
    });
  }
}
