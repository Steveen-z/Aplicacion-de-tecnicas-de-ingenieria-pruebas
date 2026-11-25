import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { migracionesPendientes, migracionesRequeridas } from './esquema';

@ApiTags('Salud')
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly requeridas = migracionesRequeridas();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Para monitoreo y para el equipo: comprueba que la base responde y que el esquema
   * tiene aplicadas todas las migraciones que necesita esta versión del código.
   * Responde 503 con el motivo si algo falta (p. ej. olvidar `npm run db:migrar`).
   */
  @Get()
  async estado() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('La base de datos no responde');
    }

    const filas = await this.prisma.$queryRaw<{ version: string }[]>`
      SELECT version FROM schema_migraciones
      WHERE to_regclass('public.schema_migraciones') IS NOT NULL
      ORDER BY version`.catch(() => [] as { version: string }[]);
    const aplicadas = filas.map((f) => f.version);
    const pendientes = migracionesPendientes(this.requeridas, aplicadas);
    if (pendientes.length > 0) {
      throw new ServiceUnavailableException(
        `Faltan migraciones de base de datos: ${pendientes.join(', ')}. Ejecuta: npm run db:migrar`,
      );
    }

    return {
      estado: 'ok',
      baseDeDatos: 'conectada',
      esquema: aplicadas,
      fecha: new Date().toISOString(),
    };
  }
}
