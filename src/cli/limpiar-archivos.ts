/**
 * Limpia archivos subidos que nadie usa (más de 24 h sin referencia).
 *   npm run archivos:limpiar                 borra
 *   npm run archivos:limpiar -- --simulacion solo informa qué borraría
 *   npm run archivos:limpiar -- --horas 48   cambia la antigüedad mínima
 * Salida: una línea con los conteos. Código de salida: 0 bien, 1 error inesperado, 2 hubo errores por archivo.
 * Se puede programar (cron / Programador de tareas) y repetir sin riesgo.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { validateEnv } from '../config/env.validation';
import { ArchivosCoreModule } from '../modules/archivos/archivos-core.module';
import { LimpiarArchivosUseCase } from '../modules/archivos/application/limpiar-archivos.use-case';
import { PrismaModule } from '../shared/infrastructure/prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, ArchivosCoreModule],
})
class CliModule {}

export function leerOpciones(args: string[]): { simulacion: boolean; antiguedadHoras: number } {
  const i = args.indexOf('--horas');
  const horas = i >= 0 ? Number(args[i + 1]) : 24;
  if (!Number.isFinite(horas) || horas < 1) throw new Error('--horas debe ser un número mayor o igual a 1');
  return { simulacion: args.includes('--simulacion'), antiguedadHoras: horas };
}

async function main(): Promise<number> {
  const opciones = leerOpciones(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const r = await app.get(LimpiarArchivosUseCase).execute(opciones);
    console.log(
      `revisados=${r.revisados} borrados=${r.borrados} conservados=${r.conservados} errores=${r.errores} simulacion=${r.simulacion}`,
    );
    return r.errores > 0 ? 2 : 0;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((error) => {
      console.error(`archivos:limpiar: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
