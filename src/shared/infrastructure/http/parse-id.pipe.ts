import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Valida que un parámetro de ruta sea un id entero positivo y seguro. */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const parsed = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`El parámetro '${metadata.data ?? 'id'}' debe ser un entero positivo`);
    }
    return parsed;
  }
}
