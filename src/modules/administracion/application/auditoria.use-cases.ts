import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { Pagina, crearPagina } from '../../../shared/domain/pagination';
import {
  AUDITORIA_REPOSITORY,
  AuditoriaRepository,
  FiltroAuditoria,
  Paginacion,
  RegistroAuditoria,
} from '../domain/administracion.repository';

/** Consulta de la auditoría (solo lectura, más reciente primero). */
@Injectable()
export class ListarAuditoriaUseCase {
  constructor(@Inject(AUDITORIA_REPOSITORY) private readonly repo: AuditoriaRepository) {}

  async execute(input: FiltroAuditoria & Paginacion): Promise<Pagina<RegistroAuditoria>> {
    const { page, limit, ...filtro } = input;
    if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta) {
      throw new BusinessRuleError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    const { items, total } = await this.repo.listar(filtro, { page, limit });
    return crearPagina(items, total, page, limit);
  }
}
