import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { AdministracionModule } from './modules/administracion/administracion.module';
import { ArchivosModule } from './modules/archivos/archivos.module';
import { AuthModule } from './modules/auth/auth.module';
import { CambioRolModule } from './modules/cambio-rol/cambio-rol.module';
import { ComparacionesModule } from './modules/comparaciones/comparaciones.module';
import { FavoritosModule } from './modules/favoritos/favoritos.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { PublicacionesModule } from './modules/publicaciones/publicaciones.module';
import { VerificacionModule } from './modules/verificacion/verificacion.module';
import { AllExceptionsFilter } from './shared/infrastructure/http/all-exceptions.filter';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { CsrfGuard } from './shared/infrastructure/security/csrf.guard';
import { SeguridadWebModule } from './shared/infrastructure/security/seguridad-web.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Límite general por IP; los endpoints sensibles (login, registro, subidas) declaran uno más estricto.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    SeguridadWebModule,
    AuthModule,
    CambioRolModule,
    PublicacionesModule,
    FavoritosModule,
    ComparacionesModule,
    NotificacionesModule,
    ArchivosModule,
    VerificacionModule,
    AdministracionModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // CSRF para peticiones autenticadas por cookie (las de Bearer no lo necesitan).
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
