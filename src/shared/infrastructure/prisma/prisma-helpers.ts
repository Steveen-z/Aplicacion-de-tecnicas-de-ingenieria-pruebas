import { Prisma } from '@prisma/client';

/** Los ids de la base son BIGINT; en el dominio y en la API se manejan como number. */
export const big = (n: number): bigint => BigInt(n);
export const num = (v: bigint): number => Number(v);

/** NUMERIC de Postgres llega como Decimal; en el dominio se maneja como number. */
export const dec = (v: Prisma.Decimal | number | string): number => Number(v);
export const decOrNull = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

/** Violación de restricción UNIQUE (P2002). */
export function esViolacionUnica(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Violación de clave foránea (p. ej. el archivo referenciado se borró justo antes). */
export function esViolacionFk(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
