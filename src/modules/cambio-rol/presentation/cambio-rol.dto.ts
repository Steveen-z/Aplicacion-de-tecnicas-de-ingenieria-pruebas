import { Transform } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SolicitarCambioRolDto {
  /** Formato 00000000-0 */
  @Transform(recortar)
  @Matches(/^\d{8}-\d$/, { message: 'El DUI debe tener el formato 00000000-0' })
  dui!: string;

  /** Si se omite se usa el teléfono del perfil. */
  @IsOptional()
  @Transform(recortar)
  @Matches(/^\+?[\d\s\-().]{8,20}$/, { message: 'El número de WhatsApp no tiene un formato válido' })
  numeroWhatsapp?: string;
}
