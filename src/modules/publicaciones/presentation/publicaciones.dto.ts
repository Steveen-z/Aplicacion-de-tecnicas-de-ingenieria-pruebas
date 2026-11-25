import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../shared/infrastructure/http/pagination-query.dto';
import { MAX_FOTOGRAFIAS } from '../domain/publicacion.rules';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const ESTADOS = ['ACTIVA', 'PAUSADA', 'VENDIDA', 'RENTADA', 'PENDIENTE', 'RECHAZADA'] as const;
const OPERACIONES = ['VENTA', 'RENTA'] as const;
const ORDENES = ['RECIENTES', 'PRECIO_ASC', 'PRECIO_DESC', 'AREA_ASC', 'AREA_DESC'] as const;

const DECIMAL_2 = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false } as const;
const MAX_PRECIO = 9_999_999_999.99; // NUMERIC(12,2)
const MAX_MEDIDA = 999_999_999_999.99; // NUMERIC(14,2)

// ---------------------------------------------------------------- Consultas

export class FiltroPublicacionesDto extends PaginationQueryDto {
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  departamento?: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  municipio?: string;

  @IsOptional() @IsIn(OPERACIONES)
  tipoOperacion?: (typeof OPERACIONES)[number];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(MAX_PRECIO)
  precioMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(MAX_PRECIO)
  precioMax?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(MAX_MEDIDA)
  areaMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(MAX_MEDIDA)
  areaMax?: number;

  /** Texto libre sobre título y descripción. */
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsIn(ORDENES)
  orden: (typeof ORDENES)[number] = 'RECIENTES';
}

export class MisPublicacionesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ESTADOS)
  estado?: (typeof ESTADOS)[number];
}

// ------------------------------------------------------------ Publicar (P08)

export class TerrenoDto {
  /** Área en metros cuadrados. */
  @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_MEDIDA)
  areaM2!: number;

  @IsOptional() @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_MEDIDA)
  largoM?: number;

  @IsOptional() @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_MEDIDA)
  anchoM?: number;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(80)
  tipoTerreno?: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(5000)
  caracteristicas?: string;
}

export class UbicacionDto {
  @Transform(recortar) @IsString() @MinLength(1) @MaxLength(100)
  departamento!: string;

  @Transform(recortar) @IsString() @MinLength(1) @MaxLength(100)
  municipio!: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  distrito?: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(500)
  direccionDetalle?: string;

  /** Coordenadas exactas del terreno (opcionales; se envían juntas). Al público solo se muestra un punto aproximado. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90)
  latitud?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180)
  longitud?: number;
}

export class FotografiaDto {
  /** URL devuelta por POST /archivos/imagenes (o cualquier URL http/https). */
  @Transform(recortar)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  urlImagen!: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(250)
  descripcion?: string;

  @IsOptional() @IsBoolean()
  esPortada?: boolean;
}

export class CrearPublicacionDto {
  @Transform(recortar) @IsString() @MinLength(5) @MaxLength(180)
  titulo!: string;

  @Transform(recortar) @IsString() @MinLength(10) @MaxLength(10000)
  descripcion!: string;

  @IsIn(OPERACIONES)
  tipoOperacion!: (typeof OPERACIONES)[number];

  @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_PRECIO)
  precio!: number;

  @ValidateNested() @Type(() => TerrenoDto)
  terreno!: TerrenoDto;

  @ValidateNested() @Type(() => UbicacionDto)
  ubicacion!: UbicacionDto;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_FOTOGRAFIAS)
  @ValidateNested({ each: true }) @Type(() => FotografiaDto)
  fotografias!: FotografiaDto[];
}

// ------------------------------------------------------------ Editar (P09)

export class ActualizarTerrenoDto {
  @IsOptional() @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_MEDIDA)
  areaM2?: number;

  @IsOptional() @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_MEDIDA)
  largoM?: number;

  @IsOptional() @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_MEDIDA)
  anchoM?: number;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(80)
  tipoTerreno?: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(5000)
  caracteristicas?: string;
}

export class ActualizarUbicacionDto {
  @IsOptional() @Transform(recortar) @IsString() @MinLength(1) @MaxLength(100)
  departamento?: string;

  @IsOptional() @Transform(recortar) @IsString() @MinLength(1) @MaxLength(100)
  municipio?: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  distrito?: string;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(500)
  direccionDetalle?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90)
  latitud?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180)
  longitud?: number;
}

/** El precio no se edita aquí: usar PATCH /publicaciones/:id/precio. */
export class EditarPublicacionDto {
  @IsOptional() @Transform(recortar) @IsString() @MinLength(5) @MaxLength(180)
  titulo?: string;

  @IsOptional() @Transform(recortar) @IsString() @MinLength(10) @MaxLength(10000)
  descripcion?: string;

  @IsOptional() @ValidateNested() @Type(() => ActualizarTerrenoDto)
  terreno?: ActualizarTerrenoDto;

  @IsOptional() @ValidateNested() @Type(() => ActualizarUbicacionDto)
  ubicacion?: ActualizarUbicacionDto;
}

// ------------------------------------------------------- Precio (P11) y fotos

export class ActualizarPrecioDto {
  @IsNumber(DECIMAL_2) @Min(0.01) @Max(MAX_PRECIO)
  precio!: number;
}

export class AgregarFotografiasDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_FOTOGRAFIAS)
  @ValidateNested({ each: true }) @Type(() => FotografiaDto)
  fotografias!: FotografiaDto[];
}
