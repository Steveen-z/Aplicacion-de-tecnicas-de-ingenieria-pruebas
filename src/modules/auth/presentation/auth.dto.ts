import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const TELEFONO_FLEXIBLE = /^\+?[\d\s\-().]{8,20}$/;

export class RegistroClienteDto {
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nombreCompleto!: string;

  @Transform(recortar)
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  /** Mínimo 8 caracteres, con al menos una letra y un número (máx. 72 por el límite de bcrypt). */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: 'La contraseña debe incluir al menos una letra y un número' })
  password!: string;

  @IsOptional()
  @Transform(recortar)
  @Matches(TELEFONO_FLEXIBLE, { message: 'El teléfono no tiene un formato válido' })
  telefono?: string;
}

export class RegistroVendedorDto {
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nombreCompleto!: string;

  @Transform(recortar)
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: 'La contraseña debe incluir al menos una letra y un número' })
  password!: string;

  @Transform(recortar)
  @Matches(TELEFONO_FLEXIBLE, { message: 'El teléfono no tiene un formato válido' })
  telefono!: string;

  /** Formato 00000000-0 */
  @Transform(recortar)
  @Matches(/^\d{8}-\d$/, { message: 'El DUI debe tener el formato 00000000-0' })
  dui!: string;

  /** Si se omite se usa el teléfono. */
  @IsOptional()
  @Transform(recortar)
  @Matches(TELEFONO_FLEXIBLE, { message: 'El número de WhatsApp no tiene un formato válido' })
  numeroWhatsapp?: string;
}

export class LoginDto {
  @Transform(recortar)
  @IsEmail()
  correo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

/** Al menos un campo. El correo, el rol y el estado no se aceptan (400 por campo no permitido). */
export class ActualizarPerfilDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  nombreCompleto?: string;

  /** Enviar null o "" para borrarlo (no permitido para vendedores). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(25)
  telefono?: string | null;
}
