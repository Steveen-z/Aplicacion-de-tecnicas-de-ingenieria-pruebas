import { Module } from '@nestjs/common';
import { ArchivosModule } from '../archivos/archivos.module';
import { ActualizarPrecioUseCase } from './application/actualizar-precio.use-case';
import { CambiarEstadoUseCase } from './application/cambiar-estado.use-case';
import { CrearPublicacionUseCase } from './application/crear-publicacion.use-case';
import { EditarPublicacionUseCase } from './application/editar-publicacion.use-case';
import { GenerarEnlaceWhatsAppUseCase } from './application/generar-enlace-whatsapp.use-case';
import {
  AgregarFotografiasUseCase,
  DefinirPortadaUseCase,
  EliminarFotografiaUseCase,
} from './application/gestionar-fotografias.use-cases';
import { HistorialPreciosUseCase } from './application/historial-precios.use-case';
import { ListarMisPublicacionesUseCase } from './application/listar-mis-publicaciones.use-case';
import { ListarPublicacionesUseCase } from './application/listar-publicaciones.use-case';
import { ObtenerDetalleUseCase } from './application/obtener-detalle.use-case';
import { PUBLICACION_REPOSITORY } from './domain/publicacion.repository';
import { SERVICIO_MAPAS } from './domain/servicio-mapas.port';
import { OverpassServicioMapas } from './infrastructure/overpass-servicio-mapas';
import { PrismaPublicacionRepository } from './infrastructure/prisma-publicacion.repository';
import { PublicacionesController } from './presentation/publicaciones.controller';

@Module({
  imports: [ArchivosModule],
  controllers: [PublicacionesController],
  providers: [
    ListarPublicacionesUseCase,
    ListarMisPublicacionesUseCase,
    ObtenerDetalleUseCase,
    GenerarEnlaceWhatsAppUseCase,
    CrearPublicacionUseCase,
    EditarPublicacionUseCase,
    CambiarEstadoUseCase,
    ActualizarPrecioUseCase,
    HistorialPreciosUseCase,
    AgregarFotografiasUseCase,
    EliminarFotografiaUseCase,
    DefinirPortadaUseCase,
    { provide: PUBLICACION_REPOSITORY, useClass: PrismaPublicacionRepository },
    { provide: SERVICIO_MAPAS, useClass: OverpassServicioMapas },
  ],
})
export class PublicacionesModule {}
