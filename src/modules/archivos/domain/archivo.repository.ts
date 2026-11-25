import { CategoriaArchivo } from './tipo-archivo';

export const ARCHIVO_REPOSITORY = Symbol('ARCHIVO_REPOSITORY');

export interface ArchivoRegistrado {
  ruta: string;
  idUsuario: number;
  categoria: CategoriaArchivo;
}

export interface ArchivoRepository {
  registrar(archivo: ArchivoRegistrado): Promise<void>;
  buscarPorRutas(rutas: string[]): Promise<ArchivoRegistrado[]>;
  /** Archivos registrados antes de `corte`, por lotes ordenados por id (para el barrido). */
  listarAntiguos(corte: Date, despuesDeId: number, limite: number): Promise<{ idArchivo: number; ruta: string }[]>;
  /** Borra el registro solo si sigue sin referencias y es anterior a `corte`. true si lo borró. */
  eliminarSiSinReferencia(ruta: string, corte: Date): Promise<boolean>;
  /** Como eliminarSiSinReferencia pero sin borrar (modo simulación). */
  eliminarSiSinReferenciaSimulado(ruta: string, corte: Date): Promise<boolean>;
  /** Cuáles de estas rutas tienen registro. */
  rutasRegistradas(rutas: string[]): Promise<Set<string>>;
}
