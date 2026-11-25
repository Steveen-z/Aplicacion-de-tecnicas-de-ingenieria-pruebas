import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SESSION_VALIDATOR } from '../../shared/domain/session-validator.port';
import { EmitirSesionService } from './application/services/emitir-sesion.service';
import { CerrarSesionUseCase } from './application/use-cases/cerrar-sesion.use-case';
import { IniciarSesionUseCase } from './application/use-cases/iniciar-sesion.use-case';
import { ActualizarPerfilUseCase } from './application/use-cases/actualizar-perfil.use-case';
import { ObtenerPerfilUseCase } from './application/use-cases/obtener-perfil.use-case';
import { RegistrarClienteUseCase } from './application/use-cases/registrar-cliente.use-case';
import { RegistrarVendedorUseCase } from './application/use-cases/registrar-vendedor.use-case';
import { RenovarSesionUseCase } from './application/use-cases/renovar-sesion.use-case';
import { ValidarSesionUseCase } from './application/use-cases/validar-sesion.use-case';
import { PASSWORD_HASHER, SESSION_TTL_SECONDS, TOKEN_SERVICE } from './domain/ports';
import { SESION_REPOSITORY } from './domain/sesion.repository';
import { USUARIO_REPOSITORY } from './domain/usuario.repository';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { PrismaSesionRepository } from './infrastructure/prisma-sesion.repository';
import { PrismaUsuarioRepository } from './infrastructure/prisma-usuario.repository';
import { AuthController } from './presentation/auth.controller';

/**
 * Global: expone SESSION_VALIDATOR para que los guards compartidos funcionen
 * en cualquier módulo sin importar AuthModule en cada uno.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    EmitirSesionService,
    RegistrarClienteUseCase,
    RegistrarVendedorUseCase,
    IniciarSesionUseCase,
    CerrarSesionUseCase,
    RenovarSesionUseCase,
    ObtenerPerfilUseCase,
    ActualizarPerfilUseCase,
    ValidarSesionUseCase,
    { provide: SESSION_VALIDATOR, useExisting: ValidarSesionUseCase },
    { provide: USUARIO_REPOSITORY, useClass: PrismaUsuarioRepository },
    { provide: SESION_REPOSITORY, useClass: PrismaSesionRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    {
      provide: SESSION_TTL_SECONDS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => Number(config.get('JWT_EXPIRES_IN') ?? 86400),
    },
  ],
  exports: [SESSION_VALIDATOR],
})
export class AuthModule {}
