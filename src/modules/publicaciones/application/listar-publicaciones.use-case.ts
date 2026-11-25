import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import { FiltroPublicaciones, PublicacionResumen } from '../domain/publicacion';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';

export interface ListarPublicacionesInput {
  filtro: FiltroPublicaciones;
  page: number;
  limit: number;
  /** true si la petición trae una sesión válida. */
  autenticado: boolean;
}

export interface ListadoPublicaciones extends Pagina<PublicacionResumen> {
  sinResultados: boolean;
  mensaje: string | null;
  /** P04: los visitantes sin sesión ven el llamado a crear una cuenta. */
  invitarARegistrarse: boolean;
}

/** P04 (consultar publicaciones disponibles) y P05 (buscar y filtrar terrenos). */
@Injectable()
export class ListarPublicacionesUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(input: ListarPublicacionesInput): Promise<ListadoPublicaciones> {
    const { filtro, page, limit } = input;
    this.validarRangos(filtro);

    const { items, total } = await this.repo.buscarActivas(filtro, { page, limit });

    return {
      ...crearPagina(items, total, page, limit),
      sinResultados: total === 0,
      mensaje:
        total === 0
          ? 'No encontramos terrenos con esos criterios. Prueba ampliando el rango de precio, el tamaño o la zona.'
          : null,
      invitarARegistrarse: !input.autenticado,
    };
  }

  private validarRangos(f: FiltroPublicaciones): void {
    const errores: string[] = [];
    if (f.precioMin !== undefined && f.precioMax !== undefined && f.precioMin > f.precioMax) {
      errores.push('El precio mínimo no puede ser mayor que el precio máximo');
    }
    if (f.areaMin !== undefined && f.areaMax !== undefined && f.areaMin > f.areaMax) {
      errores.push('El área mínima no puede ser mayor que el área máxima');
    }
    if (errores.length > 0) {
      throw new BusinessRuleError('Los criterios de búsqueda no son coherentes', errores);
    }
  }
}
