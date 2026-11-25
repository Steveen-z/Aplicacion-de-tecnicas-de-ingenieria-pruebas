import { Inject, Injectable } from '@nestjs/common';
import { CarpetaArchivos, FILE_STORAGE, FileStorage } from '../../../shared/domain/file-storage.port';
import { ARCHIVO_REPOSITORY, ArchivoRepository } from '../domain/archivo.repository';

export interface ResultadoLimpieza {
  revisados: number;
  borrados: number;
  conservados: number;
  errores: number;
  simulacion: boolean;
}

const LOTE = 500;
const CARPETAS: CarpetaArchivos[] = ['imagenes', 'documentos'];

/**
 * Borra los archivos subidos que nadie usa (documento de arquitectura: "limpieza de archivos
 * huérfanos"). Solo los de más de `antiguedadHoras` (por defecto 24 h), para no borrar una foto
 * recién subida cuya publicación aún se está creando. Repetible: una segunda pasada no borra nada.
 *  1) Registros sin referencias: primero se borra la fila y después el archivo (el peor caso es
 *     un archivo sin fila, que recoge el paso 2; nunca una fila apuntando a un archivo inexistente).
 *  2) Archivos en disco sin registro (subidas interrumpidas).
 */
@Injectable()
export class LimpiarArchivosUseCase {
  constructor(
    @Inject(ARCHIVO_REPOSITORY) private readonly repo: ArchivoRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(opciones: { simulacion: boolean; ahora?: Date; antiguedadHoras?: number }): Promise<ResultadoLimpieza> {
    const corte = new Date((opciones.ahora ?? new Date()).getTime() - (opciones.antiguedadHoras ?? 24) * 3600_000);
    const r: ResultadoLimpieza = { revisados: 0, borrados: 0, conservados: 0, errores: 0, simulacion: opciones.simulacion };

    // Rutas ya tratadas en esta ejecución: el paso 2 no las vuelve a intentar ni a contar.
    const procesadas = new Set<string>();

    // 1) Registros antiguos sin referencias
    let despuesDeId = 0;
    for (;;) {
      const lote = await this.repo.listarAntiguos(corte, despuesDeId, LOTE);
      if (lote.length === 0) break;
      despuesDeId = lote[lote.length - 1].idArchivo;
      for (const { ruta } of lote) {
        procesadas.add(ruta);
        r.revisados++;
        try {
          if (opciones.simulacion) {
            // En simulación se informa lo que se borraría sin tocar nada.
            const sinReferencia = await this.repo.eliminarSiSinReferenciaSimulado(ruta, corte);
            if (sinReferencia) r.borrados++;
            else r.conservados++;
            continue;
          }
          if (await this.repo.eliminarSiSinReferencia(ruta, corte)) {
            await this.storage.eliminar(ruta);
            r.borrados++;
          } else {
            r.conservados++;
          }
        } catch {
          r.errores++;
        }
      }
    }

    // 2) Archivos en disco sin registro
    for (const carpeta of CARPETAS) {
      const candidatos: string[] = [];
      for await (const { ruta, modificadoEn } of this.storage.listar(carpeta)) {
        if (modificadoEn < corte) candidatos.push(ruta);
      }
      for (let i = 0; i < candidatos.length; i += LOTE) {
        const parte = candidatos.slice(i, i + LOTE);
        const registradas = await this.repo.rutasRegistradas(parte);
        for (const ruta of parte) {
          if (registradas.has(ruta) || procesadas.has(ruta)) continue; // en uso o ya tratado en el paso 1
          r.revisados++;
          try {
            if (!opciones.simulacion) await this.storage.eliminar(ruta);
            r.borrados++;
          } catch {
            r.errores++;
          }
        }
      }
    }
    return r;
  }
}
