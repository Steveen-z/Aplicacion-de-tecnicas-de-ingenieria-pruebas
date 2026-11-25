import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';

@ApiTags('Salud')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Para monitoreo y balanceadores: comprueba que la API y la base de datos responden. */
  @Get()
  async estado() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('La base de datos no responde');
    }
    return { estado: 'ok', baseDeDatos: 'conectada', fecha: new Date().toISOString() };
  }
}
