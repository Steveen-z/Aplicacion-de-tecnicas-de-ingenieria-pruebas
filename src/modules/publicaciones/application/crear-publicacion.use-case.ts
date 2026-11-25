import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';
import {
  DatosCasa,
  DatosTerreno,
  FotografiaEntrada,
  Publicacion,
  TipoOperacion,
  TipoPropiedad,
} from '../domain/publicacion';
import { ResolverArchivosService } from '../../archivos/application/resolver-archivos.service';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';
import {
  MAX_FOTOGRAFIAS,
  aproximarCoordenadas,
  validarDatosPorTipo,
  validarParCoordenadas,
} from '../domain/publicacion.rules';

export interface CrearPublicacionInput {
  user: AuthUser;
  titulo: string;
  descripcion: string;
  tipoOperacion: TipoOperacion;
  /** Por defecto TERRENO (compatibilidad con clientes anteriores a los tipos de inmueble). */
  tipoPropiedad?: TipoPropiedad;
  casa?: Partial<DatosCasa> | null;
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
  fotografias: FotografiaEntrada[];
}

/** P08 - Publicar inmueble mediante formulario por pasos. */
@Injectable()
export class CrearPublicacionUseCase {
  constructor(
    @Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository,
    private readonly archivos: ResolverArchivosService,
  ) {}

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
    const tipoPropiedad = input.tipoPropiedad ?? 'TERRENO';
    validarDatosPorTipo(tipoPropiedad, input.casa);
    const casa: DatosCasa | null =
      tipoPropiedad === 'CASA'
        ? {
            habitaciones: input.casa!.habitaciones!,
            banos: input.casa!.banos!,
            areaConstruidaM2: input.casa!.areaConstruidaM2!,
            niveles: input.casa!.niveles ?? null,
            estacionamientos: input.casa!.estacionamientos ?? null,
          }
        : null;

    // Exactamente una portada: la primera marcada, o la primera foto si ninguna lo está.
    const indicePortada = Math.max(0, input.fotografias.findIndex((f) => f.esPortada));
    // Solo imágenes subidas a la plataforma por este vendedor (422 si no, 403 si son de otro).
    const rutas = await this.archivos.resolverImagenes(input.user.idUsuario, input.fotografias.map((f) => f.urlImagen));
    const fotografias = input.fotografias.map((f, i) => ({ ...f, ruta: rutas[i].ruta, esPortada: i === indicePortada }));

    return this.repo.crear({
      idVendedor: input.user.idVendedor,
      titulo: input.titulo.trim(),
      descripcion: input.descripcion.trim(),
      tipoOperacion: input.tipoOperacion,
      tipoPropiedad,
      casa,
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
