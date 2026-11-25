import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * El formato de cada dato lo evalúa el dominio (SolicitudCambioRol), para que
 * P03 responda 422 con la lista completa de `requisitosPendientes` en lugar de
 * un 400 por el primer campo inválido.
 */
export class SolicitarCambioRolDto {
  /** Formato 00000000-0 */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  dui?: string;

  /** Si se omite se usa el teléfono del perfil (o el enviado en `telefono`). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(25)
  numeroWhatsapp?: string;

  /** Teléfono de contacto; completa el perfil si el cliente se registró sin él. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(25)
  telefono?: string;
}
