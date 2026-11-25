import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';
import { AuthUser } from '../../../shared/domain/auth-user';
import { ParseIdPipe } from '../../../shared/infrastructure/http/parse-id.pipe';
import { CurrentUser } from '../../../shared/infrastructure/security/decorators';
import { JwtAuthGuard } from '../../../shared/infrastructure/security/jwt-auth.guard';
import {
  CrearComparacionUseCase,
  ListarComparacionesUseCase,
  ObtenerComparacionUseCase,
} from '../application/comparaciones.use-cases';
import { MAX_TERRENOS_COMPARACION } from '../domain/comparacion';

export class CrearComparacionDto {
  /** Ids de las publicaciones a comparar (de 2 a 4). */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_TERRENOS_COMPARACION)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsPublicaciones!: number[];
}

@ApiTags('Comparaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comparaciones')
export class ComparacionesController {
  constructor(
    private readonly crear: CrearComparacionUseCase,
    private readonly obtener: ObtenerComparacionUseCase,
    private readonly listar: ListarComparacionesUseCase,
  ) {}

  /** P12 - Compara de 2 a 4 terrenos lado a lado (precio, ubicación, dimensiones, área y características). */
  @Post()
  comparar(@Body() dto: CrearComparacionDto, @CurrentUser() user: AuthUser) {
    return this.crear.execute({ user, idsPublicaciones: dto.idsPublicaciones });
  }

  @Get()
  misComparaciones(@CurrentUser() user: AuthUser) {
    return this.listar.execute(user);
  }

  @Get(':id')
  verComparacion(@Param('id', ParseIdPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.obtener.execute({ user, idComparacion: id });
  }
}
