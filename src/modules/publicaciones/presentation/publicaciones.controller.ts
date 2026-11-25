import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../shared/domain/auth-user';
import { ParseIdPipe } from '../../../shared/infrastructure/http/parse-id.pipe';
import { CurrentUser, Roles } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/security/roles.guard';
import { ActualizarPrecioUseCase } from '../application/actualizar-precio.use-case';
import { CambiarEstadoUseCase } from '../application/cambiar-estado.use-case';
import { CrearPublicacionUseCase } from '../application/crear-publicacion.use-case';
import { EditarPublicacionUseCase } from '../application/editar-publicacion.use-case';
import { GenerarEnlaceWhatsAppUseCase } from '../application/generar-enlace-whatsapp.use-case';
import {
  AgregarFotografiasUseCase,
  DefinirPortadaUseCase,
  EliminarFotografiaUseCase,
} from '../application/gestionar-fotografias.use-cases';
import { HistorialPreciosUseCase } from '../application/historial-precios.use-case';
import { ListarMisPublicacionesUseCase } from '../application/listar-mis-publicaciones.use-case';
import { ListarPublicacionesUseCase } from '../application/listar-publicaciones.use-case';
import { ObtenerDetalleUseCase } from '../application/obtener-detalle.use-case';
import { construirVistaDetalle } from '../application/vistas';
import { AccionEstado } from '../domain/publicacion.rules';
import {
  ActualizarPrecioDto,
  AgregarFotografiasDto,
  CrearPublicacionDto,
  EditarPublicacionDto,
  FiltroPublicacionesDto,
  FotografiaDto,
  MisPublicacionesQueryDto,
} from './publicaciones.dto';

/** Endpoints que exigen sesión y rol VENDEDOR. */
const SoloVendedor = () =>
  applyDecorators(ApiBearerAuth(), UseGuards(JwtAuthGuard, RolesGuard), Roles('VENDEDOR'));

const aNuevaFotografia = (f: FotografiaDto) => ({
  urlImagen: f.urlImagen,
  descripcion: f.descripcion ?? null,
  esPortada: f.esPortada ?? false,
});

@ApiTags('Publicaciones')
@Controller('publicaciones')
export class PublicacionesController {
  constructor(
    private readonly listar: ListarPublicacionesUseCase,
    private readonly listarMias: ListarMisPublicacionesUseCase,
    private readonly obtenerDetalle: ObtenerDetalleUseCase,
    private readonly generarWhatsApp: GenerarEnlaceWhatsAppUseCase,
    private readonly crear: CrearPublicacionUseCase,
    private readonly editar: EditarPublicacionUseCase,
    private readonly cambiarEstado: CambiarEstadoUseCase,
    private readonly actualizarPrecio: ActualizarPrecioUseCase,
    private readonly historialPrecios: HistorialPreciosUseCase,
    private readonly agregarFotografias: AgregarFotografiasUseCase,
    private readonly eliminarFotografia: EliminarFotografiaUseCase,
    private readonly definirPortada: DefinirPortadaUseCase,
  ) {}

  // ------------------------------------------------------------- Consulta

  /** P04 + P05 - Listado público de publicaciones activas: filtros, búsqueda por cercanía y coordenadas públicas para el mapa. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  listarActivas(@Query() query: FiltroPublicacionesDto, @CurrentUser() user?: AuthUser) {
    const { page, limit, lat, lng, radioKm, ...filtro } = query;
    const cercania =
      lat !== undefined && lng !== undefined && radioKm !== undefined ? { latitud: lat, longitud: lng, radioKm } : undefined;
    return this.listar.execute({ filtro: { ...filtro, cercania }, page, limit, autenticado: user !== undefined });
  }

  /** Publicaciones del vendedor autenticado (cualquier estado). Debe ir antes de ':id'. */
  @Get('mias')
  @SoloVendedor()
  misPublicaciones(@Query() query: MisPublicacionesQueryDto, @CurrentUser() user: AuthUser) {
    return this.listarMias.execute({ user, estado: query.estado, page: query.page, limit: query.limit });
  }

  /** P06 - Detalle: galería, mapa, puntos de interés y valoración de la ubicación. */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  detalle(@Param('id', ParseIdPipe) id: number, @CurrentUser() user?: AuthUser) {
    return this.obtenerDetalle.execute(id, user);
  }

  @Get(':id/historial-precios')
  @UseGuards(OptionalJwtAuthGuard)
  historial(@Param('id', ParseIdPipe) id: number, @CurrentUser() user?: AuthUser) {
    return this.historialPrecios.execute(id, user);
  }

  /** P07 - Enlace de WhatsApp del vendedor (requiere sesión para evitar la recolección masiva de números). */
  @Get(':id/whatsapp')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  whatsapp(@Param('id', ParseIdPipe) id: number) {
    return this.generarWhatsApp.execute(id);
  }

  // ------------------------------------------------------------- Vendedor

  /** P08 - Publicar un inmueble (queda ACTIVA con sus fotografías). */
  @Post()
  @SoloVendedor()
  async publicar(@Body() dto: CrearPublicacionDto, @CurrentUser() user: AuthUser) {
    const publicacion = await this.crear.execute({
      user,
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      tipoOperacion: dto.tipoOperacion,
      tipoPropiedad: dto.tipoPropiedad,
      casa: dto.casa ?? null,
      precio: dto.precio,
      terreno: {
        areaM2: dto.terreno.areaM2,
        largoM: dto.terreno.largoM ?? null,
        anchoM: dto.terreno.anchoM ?? null,
        tipoTerreno: dto.terreno.tipoTerreno ?? null,
        caracteristicas: dto.terreno.caracteristicas ?? null,
      },
      ubicacion: {
        departamento: dto.ubicacion.departamento,
        municipio: dto.ubicacion.municipio,
        distrito: dto.ubicacion.distrito ?? null,
        direccionDetalle: dto.ubicacion.direccionDetalle ?? null,
        latitud: dto.ubicacion.latitud ?? null,
        longitud: dto.ubicacion.longitud ?? null,
      },
      fotografias: dto.fotografias.map(aNuevaFotografia),
    });
    return construirVistaDetalle(publicacion, true);
  }

  /** P09 - Editar datos (el precio se cambia en PATCH :id/precio). */
  @Patch(':id')
  @SoloVendedor()
  async editarPublicacion(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: EditarPublicacionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const publicacion = await this.editar.execute({ user, idPublicacion: id, ...dto });
    return construirVistaDetalle(publicacion, true);
  }

  /** P11 - Cambia el precio, registra el historial y notifica la baja a los interesados. */
  @Patch(':id/precio')
  @SoloVendedor()
  cambiarPrecio(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: ActualizarPrecioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actualizarPrecio.execute({ user, idPublicacion: id, nuevoPrecio: dto.precio });
  }

  @Post(':id/pausar')
  @HttpCode(HttpStatus.OK)
  @SoloVendedor()
  pausar(@Param('id', ParseIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ejecutarAccion(id, user, 'PAUSAR');
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.OK)
  @SoloVendedor()
  reactivar(@Param('id', ParseIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ejecutarAccion(id, user, 'REACTIVAR');
  }

  @Post(':id/marcar-vendida')
  @HttpCode(HttpStatus.OK)
  @SoloVendedor()
  marcarVendida(@Param('id', ParseIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ejecutarAccion(id, user, 'MARCAR_VENDIDA');
  }

  @Post(':id/marcar-rentada')
  @HttpCode(HttpStatus.OK)
  @SoloVendedor()
  marcarRentada(@Param('id', ParseIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ejecutarAccion(id, user, 'MARCAR_RENTADA');
  }

  // ------------------------------------------------------------- Fotografías

  @Post(':id/fotografias')
  @SoloVendedor()
  agregarFotos(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: AgregarFotografiasDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.agregarFotografias.execute({
      user,
      idPublicacion: id,
      fotografias: dto.fotografias.map(aNuevaFotografia),
    });
  }

  @Delete(':id/fotografias/:idFotografia')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SoloVendedor()
  async eliminarFoto(
    @Param('id', ParseIdPipe) id: number,
    @Param('idFotografia', ParseIdPipe) idFotografia: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.eliminarFotografia.execute({ user, idPublicacion: id, idFotografia });
  }

  @Patch(':id/fotografias/:idFotografia/portada')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SoloVendedor()
  async portada(
    @Param('id', ParseIdPipe) id: number,
    @Param('idFotografia', ParseIdPipe) idFotografia: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.definirPortada.execute({ user, idPublicacion: id, idFotografia });
  }

  private ejecutarAccion(id: number, user: AuthUser, accion: AccionEstado) {
    return this.cambiarEstado.execute({ user, idPublicacion: id, accion });
  }
}
