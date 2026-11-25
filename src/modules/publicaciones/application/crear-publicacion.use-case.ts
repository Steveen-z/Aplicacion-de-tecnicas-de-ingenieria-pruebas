import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';
import {
  DatosTerreno,
  NuevaFotografia,
  Publicacion,
  TipoOperacion,
} from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import { MAX_FOTOGRAFIAS, aproximarCoordenadas, validarParCoordenadas } from '../domain/publicacion.rules';

export interface CrearPublicacionInput {
  user: AuthUser;
  titulo: string;
  descripcion: string;
  tipoOperacion: TipoOperacion;
  precio: number;
  terreno: DatosTerreno;
  ubicacion: {
    departamento: string;
    municipio: string;
    distrito: string | null;
    direccionDetalle: string | null;
    latitud: number | null;
    longitud: number | null;
  };
  fotografias: NuevaFotografia[];
}

/** P08 - Publicar inmueble mediante formulario por pasos. */
@Injectable()
export class CrearPublicacionUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: CrearPublicacionInput): Promise<Publicacion> {
    if (input.user.idVendedor === null) {
      throw new ForbiddenError('Necesitas una cuenta de vendedor para publicar');
    }
    if (input.fotografias.length < 1) {
      throw new BusinessRuleError('Debes agregar al menos una fotografía');
    }
    if (input.fotografias.length > MAX_FOTOGRAFIAS) {
      throw new BusinessRuleError(`Solo se permiten hasta ${MAX_FOTOGRAFIAS} fotografías por publicación`);
    }
    validarParCoordenadas(input.ubicacion.latitud, input.ubicacion.longitud);

    // Exactamente una portada: la primera marcada, o la primera foto si ninguna lo está.
    const indicePortada = Math.max(0, input.fotografias.findIndex((f) => f.esPortada));
    const fotografias = input.fotografias.map((f, i) => ({ ...f, esPortada: i === indicePortada }));

    return this.repo.crear({
      idVendedor: input.user.idVendedor,
      titulo: input.titulo.trim(),
      descripcion: input.descripcion.trim(),
      tipoOperacion: input.tipoOperacion,
      precio: input.precio,
      terreno: input.terreno,
      ubicacion: {
        ...input.ubicacion,
        ...aproximarCoordenadas(input.ubicacion.latitud, input.ubicacion.longitud),
      },
      fotografias,
    });
  }
}
