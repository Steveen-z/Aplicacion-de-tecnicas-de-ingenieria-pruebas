import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { aNumeroWhatsApp } from '../../../shared/domain/validators';
import { PUBLICACION_REPOSITORY, PublicacionRepository } from '../domain/publicacion.repository';

/** P07 - Contactar al vendedor por WhatsApp (UML: Publicacion.generarEnlaceWhatsApp). */
@Injectable()
export class GenerarEnlaceWhatsAppUseCase {
  constructor(@Inject(PUBLICACION_REPOSITORY) private readonly repo: PublicacionRepository) {}

  async execute(idPublicacion: number): Promise<{ url: string }> {
    const publicacion = await this.repo.buscarPorId(idPublicacion);
    if (!publicacion || publicacion.estado !== 'ACTIVA') {
      throw new NotFoundError('La publicación no está disponible');
    }

    const numero =
      aNumeroWhatsApp(publicacion.vendedor.numeroWhatsapp) ?? aNumeroWhatsApp(publicacion.vendedor.telefono);
    if (!numero) {
      throw new BusinessRuleError('El contacto del vendedor no está disponible');
    }

    const mensaje = `Hola, me interesa tu publicación "${publicacion.titulo}" (ref. ${publicacion.idPublicacion}) en InmobiSV.`;
    return { url: `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` };
  }
}
