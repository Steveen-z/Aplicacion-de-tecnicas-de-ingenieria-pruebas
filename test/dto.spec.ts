import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FiltroPublicacionesDto } from '../src/modules/publicaciones/presentation/publicaciones.dto';

const errores = (query: Record<string, string>) =>
  validateSync(plainToInstance(FiltroPublicacionesDto, query)).map((e) => e.property);

it('cercanía: lat, lng y radioKm van juntos y en rango', () => {
  assert.deepEqual(errores({ lat: '13.48', lng: '-88.18', radioKm: '5' }), []);
  assert.deepEqual(errores({}), []);
  assert.deepEqual(errores({ lat: '13.48' }).sort(), ['lng', 'radioKm']);
  assert.deepEqual(errores({ lat: '13.48', lng: '-88.18', radioKm: '100' }), ['radioKm']);
  assert.deepEqual(errores({ lat: '13.48', lng: '-88.18', radioKm: '0.01' }), ['radioKm']);
  assert.deepEqual(errores({ lat: '95', lng: '-88.18', radioKm: '5' }), ['lat']);
});

it('orden=DISTANCIA exige centro y radio', () => {
  assert.deepEqual(errores({ orden: 'DISTANCIA' }).sort(), ['lat', 'lng', 'radioKm']);
  assert.deepEqual(errores({ orden: 'DISTANCIA', lat: '13.48', lng: '-88.18', radioKm: '5' }), []);
});
