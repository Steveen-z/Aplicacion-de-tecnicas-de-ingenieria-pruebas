import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import {
  ComparacionGuardada,
  TerrenoComparable,
  construirResumen,
  validarMismaOperacion,
  validarSeleccion,
} from '../domain/comparacion';
import { COMPARACION_REPOSITORY, ComparacionRepository } from '../domain/comparacion.repository';

function exigirCliente(user: AuthUser): number {
  if (user.idCliente === null) throw new ForbiddenError('Tu cuenta no tiene perfil de cliente');
  return user.idCliente;
}

function armarVista(comparacion: ComparacionGuardada, terrenos: TerrenoComparable[]) {
  return {
    idComparacion: comparacion.idComparacion,
    fechaCreacion: comparacion.fechaCreacion,
    terrenos,
    // El resumen solo considera terrenos aún disponibles.
    resumen: construirResumen(terrenos.filter((t) => t.disponible)),
  };
}

/** P12 - Comparar terrenos: valida la selección, guarda la comparación y devuelve la vista lado a lado. */
@Injectable()
export class CrearComparacionUseCase {
  constructor(@Inject(COMPARACION_REPOSITORY) private readonly repo: ComparacionRepository) {}

  async execute(input: { user: AuthUser; idsPublicaciones: number[] }) {
    const idCliente = exigirCliente(input.user);
    const ids = validarSeleccion(input.idsPublicaciones);

    const terrenos = await this.repo.obtenerTerrenos(ids);
    const noDisponibles = ids.filter(
      (id) => !terrenos.some((t) => t.idPublicacion === id && t.disponible),
    );
    if (noDisponibles.length > 0) {
      throw new BusinessRuleError('Algunos terrenos no existen o ya no están disponibles', {
        idsNoDisponibles: noDisponibles,
      });
    }
    validarMismaOperacion(terrenos);

    const comparacion = await this.repo.crear(idCliente, ids);
    return armarVista(comparacion, terrenos);
  }
}

/** Reabre una comparación guardada con los datos actuales de cada terreno. */
@Injectable()
export class ObtenerComparacionUseCase {
  constructor(@Inject(COMPARACION_REPOSITORY) private readonly repo: ComparacionRepository) {}

  async execute(input: { user: AuthUser; idComparacion: number }) {
    const idCliente = exigirCliente(input.user);
    const comparacion = await this.repo.buscarPorId(input.idComparacion, idCliente);
    if (!comparacion) throw new NotFoundError('La comparación no existe');

    const terrenos = await this.repo.obtenerTerrenos(comparacion.idsPublicaciones);
    return armarVista(comparacion, terrenos);
  }
}

@Injectable()
export class ListarComparacionesUseCase {
  constructor(@Inject(COMPARACION_REPOSITORY) private readonly repo: ComparacionRepository) {}

  execute(user: AuthUser): Promise<ComparacionGuardada[]> {
    return this.repo.listar(exigirCliente(user));
  }
}
