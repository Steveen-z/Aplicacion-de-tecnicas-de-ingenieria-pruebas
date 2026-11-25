import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from '../../../shared/domain/auditoria';
import { PaginationQueryDto } from '../../../shared/infrastructure/http/pagination-query.dto';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const ROLES = ['CLIENTE', 'VENDEDOR', 'ADMIN'] as const;
const ESTADOS_CUENTA = ['ACTIVA', 'INACTIVA', 'BLOQUEADA'] as const;
const ESTADOS_PUBLICACION = ['ACTIVA', 'PAUSADA', 'VENDIDA', 'RENTADA', 'PENDIENTE', 'RECHAZADA'] as const;

export class UsuariosAdminQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ROLES)
  rol?: (typeof ROLES)[number];

  @IsOptional() @IsIn(ESTADOS_CUENTA)
  estado?: (typeof ESTADOS_CUENTA)[number];

  /** Busca en nombre y correo. */
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  q?: string;
}

export class CambiarEstadoUsuarioDto {
  @IsIn(['ACTIVA', 'BLOQUEADA'])
  estado!: 'ACTIVA' | 'BLOQUEADA';

  /** Obligatorio al bloquear (422 si falta). */
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(1000)
  motivo?: string;
}

export class PublicacionesAdminQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ESTADOS_PUBLICACION)
  estado?: (typeof ESTADOS_PUBLICACION)[number];

  @IsOptional() @IsIn(['VENTA', 'RENTA'])
  tipoOperacion?: 'VENTA' | 'RENTA';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  idVendedor?: number;

  @IsOptional() @Transform(recortar) @IsString() @MaxLength(100)
  q?: string;
}

export class ModerarPublicacionDto {
  @IsIn(['RECHAZAR', 'RESTAURAR'])
  accion!: 'RECHAZAR' | 'RESTAURAR';

  /** Obligatorio al rechazar (422 si falta); el vendedor lo recibe en una notificación. */
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(1000)
  motivo?: string;
}

export class AuditoriaQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ACCIONES_AUDITORIA)
  accion?: (typeof ACCIONES_AUDITORIA)[number];

  @IsOptional() @IsIn(ENTIDADES_AUDITORIA)
  entidad?: (typeof ENTIDADES_AUDITORIA)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  idEntidad?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  idActor?: number;

  /** Fecha ISO 8601 (400 si no es válida). */
  @IsOptional() @Type(() => Date) @IsDate({ message: 'desde debe ser una fecha ISO 8601 válida' })
  desde?: Date;

  @IsOptional() @Type(() => Date) @IsDate({ message: 'hasta debe ser una fecha ISO 8601 válida' })
  hasta?: Date;
}
