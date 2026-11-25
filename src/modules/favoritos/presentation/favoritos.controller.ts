import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../../shared/domain/auth-user';
import { ParseIdPipe } from '../../../shared/infrastructure/http/parse-id.pipe';
import { CurrentUser } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import {
  AlternarFavoritoUseCase,
  EliminarFavoritoUseCase,
  ListarFavoritosUseCase,
} from '../application/favoritos.use-cases';

@ApiTags('Favoritos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('favoritos')
export class FavoritosController {
  constructor(
    private readonly alternar: AlternarFavoritoUseCase,
    private readonly eliminar: EliminarFavoritoUseCase,
    private readonly listar: ListarFavoritosUseCase,
  ) {}

  /** Mis favoritos, con el precio al guardar, el precio actual y la variación. */
  @Get()
  misFavoritos(@CurrentUser() user: AuthUser) {
    return this.listar.execute(user);
  }

  /** P10 - Si la propiedad ya estaba guardada la quita; si no, la guarda con su precio actual. */
  @Post(':idPublicacion/alternar')
  @HttpCode(HttpStatus.OK)
  alternarFavorito(@Param('idPublicacion', ParseIdPipe) idPublicacion: number, @CurrentUser() user: AuthUser) {
    return this.alternar.execute({ user, idPublicacion });
  }

  @Delete(':idPublicacion')
  @HttpCode(HttpStatus.NO_CONTENT)
  async quitar(
    @Param('idPublicacion', ParseIdPipe) idPublicacion: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.eliminar.execute({ user, idPublicacion });
  }
}
