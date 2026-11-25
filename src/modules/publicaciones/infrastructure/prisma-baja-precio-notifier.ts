import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { big } from '../../../shared/infrastructure/prisma/prisma-helpers';
import { BajaPrecio, BajaPrecioNotifier } from '../domain/baja-precio-notifier.port';

const dinero = (valor: number) =>
  `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Adaptador del puerto: busca a los clientes que guardaron la publicación como favorita
 * y crea una notificación de tipo BAJA_PRECIO para cada uno (UML: GestorNotificaciones).
 */
@Injectable()
export class PrismaBajaPrecioNotifier implements BajaPrecioNotifier {
  constructor(private readonly prisma: PrismaService) {}

  async notificar(baja: BajaPrecio): Promise<number> {
    const favoritos = await this.prisma.favorito.findMany({
      where: { idPublicacion: big(baja.idPublicacion) },
      select: { cliente: { select: { idUsuario: true } } },
    });

    const destinatarios = [...new Set(favoritos.map((f) => f.cliente.idUsuario))].filter(
      (idUsuario) => idUsuario !== big(baja.excluirIdUsuario),
    );
    if (destinatarios.length === 0) return 0;

    await this.prisma.notificacion.createMany({
      data: destinatarios.map((idUsuario) => ({
        idUsuario,
        idPublicacion: big(baja.idPublicacion),
        titulo: 'Bajó el precio de un terreno que guardaste',
        mensaje: `"${baja.titulo}" pasó de ${dinero(baja.precioAnterior)} a ${dinero(baja.precioNuevo)}.`,
        tipo: 'BAJA_PRECIO',
      })),
    });
    return destinatarios.length;
  }
}
