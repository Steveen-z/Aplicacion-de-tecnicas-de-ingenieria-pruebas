import 'reflect-metadata';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { accesoLogMiddleware, requestIdMiddleware } from './shared/infrastructure/http/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(requestIdMiddleware);
  app.use(accesoLogMiddleware);

  // Las imágenes se sirven a un frontend en otro origen, por eso CORP "cross-origin".
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const origenes = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173,http://localhost:3001,http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origenes,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos no declarados en el DTO
      forbidNonWhitelisted: true, // y responde 400 si llegan
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  // Solo la carpeta de imágenes es pública. Los documentos de verificación nunca se sirven estáticamente.
  const carpetaUploads = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
  app.useStaticAssets(join(carpetaUploads, 'imagenes'), {
    prefix: '/uploads/imagenes/',
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
  });

  if (config.get<string>('NODE_ENV') !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('InmobiSV API')
        .setDescription('Plataforma de comercialización de terrenos en El Salvador')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, documento);
    logger.log('Documentación Swagger en /api/docs');
  }

  const puerto = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(puerto);
  logger.log(`API lista en http://localhost:${puerto}/api`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
