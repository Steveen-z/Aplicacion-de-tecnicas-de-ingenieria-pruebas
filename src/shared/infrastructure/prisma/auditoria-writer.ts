import { Prisma } from '@prisma/client';
import { NuevaAuditoria } from '../../domain/auditoria';
import { big } from './prisma-helpers';

/** Inserta la auditoría con el cliente transaccional del repositorio que ejecuta la acción. */
export async function escribirAuditoria(tx: Prisma.TransactionClient, entrada: NuevaAuditoria): Promise<void> {
  await tx.auditoria.create({
    data: {
      idActor: big(entrada.idActor),
      accion: entrada.accion,
      entidad: entrada.entidad,
      idEntidad: big(entrada.idEntidad),
      detalle: entrada.detalle as Prisma.InputJsonValue,
    },
  });
}
