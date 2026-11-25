import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BusinessRuleError } from '../src/shared/domain/errors';
import {
  aNumeroWhatsApp,
  esDuiValido,
  esTelefonoValido,
  normalizarTelefono,
} from '../src/shared/domain/validators';
import {
  aproximarCoordenadas,
  calcularNuevoEstado,
  puedeEditarse,
  validarParCoordenadas,
} from '../src/modules/publicaciones/domain/publicacion.rules';
import { distanciaMetros, evaluarCercania } from '../src/modules/publicaciones/domain/ubicacion-cercania';
import {
  calcularEstadoVerificacion,
  estadoTrasEnvio,
} from '../src/modules/verificacion/domain/documento';
import {
  construirResumen,
  validarMismaOperacion,
  validarSeleccion,
} from '../src/modules/comparaciones/domain/comparacion';
import { evaluarRequisitosVendedor } from '../src/modules/cambio-rol/domain/solicitud-cambio-rol';
import { detectarExtension } from '../src/modules/archivos/domain/tipo-archivo';
import { esRutaArchivoValida } from '../src/shared/domain/file-storage.port';

const ok = (nombre: string, fn: () => void) => it(nombre, fn);
const lanza = (fn: () => unknown) => assert.throws(fn, BusinessRuleError);

// ---- Validadores
ok('DUI válido / inválido', () => {
  assert.equal(esDuiValido('01234567-8'), true);
  assert.equal(esDuiValido('012345678'), false);
  assert.equal(esDuiValido('0123456-78'), false);
  assert.equal(esDuiValido(null), false);
});
ok('teléfono: normaliza y valida', () => {
  assert.equal(normalizarTelefono('+503 7000-1234'), '+50370001234');
  assert.equal(esTelefonoValido('7000-1234'), true);
  assert.equal(esTelefonoValido('123'), false);
  assert.equal(esTelefonoValido('abcdefgh'), false);
});
ok('WhatsApp: 8 dígitos locales -> +503; inválido -> null', () => {
  assert.equal(aNumeroWhatsApp('7000-1234'), '50370001234');
  assert.equal(aNumeroWhatsApp('+503 7000 1234'), '50370001234');
  assert.equal(aNumeroWhatsApp('123'), null);
  assert.equal(aNumeroWhatsApp(null), null);
});

// ---- Estados de publicación (P09)
const base = { estado: 'ACTIVA', tipoOperacion: 'VENTA', totalFotografias: 3 } as const;
ok('pausar ACTIVA -> PAUSADA; pausar PAUSADA falla', () => {
  assert.equal(calcularNuevoEstado('PAUSAR', base), 'PAUSADA');
  lanza(() => calcularNuevoEstado('PAUSAR', { ...base, estado: 'PAUSADA' }));
});
ok('reactivar PAUSADA -> ACTIVA; sin fotos falla', () => {
  assert.equal(calcularNuevoEstado('REACTIVAR', { ...base, estado: 'PAUSADA' }), 'ACTIVA');
  lanza(() => calcularNuevoEstado('REACTIVAR', { ...base, estado: 'PAUSADA', totalFotografias: 0 }));
  lanza(() => calcularNuevoEstado('REACTIVAR', base));
});
ok('vendida solo en VENTA; rentada solo en RENTA', () => {
  assert.equal(calcularNuevoEstado('MARCAR_VENDIDA', base), 'VENDIDA');
  lanza(() => calcularNuevoEstado('MARCAR_RENTADA', base));
  assert.equal(calcularNuevoEstado('MARCAR_RENTADA', { ...base, tipoOperacion: 'RENTA' }), 'RENTADA');
  lanza(() => calcularNuevoEstado('MARCAR_VENDIDA', { ...base, tipoOperacion: 'RENTA' }));
});
ok('una publicación VENDIDA ya no cambia ni se edita', () => {
  lanza(() => calcularNuevoEstado('PAUSAR', { ...base, estado: 'VENDIDA' }));
  lanza(() => calcularNuevoEstado('MARCAR_VENDIDA', { ...base, estado: 'VENDIDA' }));
  assert.equal(puedeEditarse('VENDIDA'), false);
  assert.equal(puedeEditarse('ACTIVA'), true);
});

// ---- Coordenadas
ok('coordenadas públicas aproximadas (2 decimales) y par obligatorio', () => {
  assert.deepEqual(aproximarCoordenadas(13.698765, -89.191234), { latitudPublica: 13.7, longitudPublica: -89.19 });
  assert.deepEqual(aproximarCoordenadas(null, null), { latitudPublica: null, longitudPublica: null });
  lanza(() => validarParCoordenadas(13.7, null));
  validarParCoordenadas(13.7, -89.2);
  validarParCoordenadas(undefined, undefined);
});

// ---- Ubicación
ok('distancia Haversine razonable (San Salvador -> Santa Ana ≈ 55 km)', () => {
  const d = distanciaMetros(13.6929, -89.2182, 13.9942, -89.5597);
  assert.ok(d > 45_000 && d < 60_000, `distancia fuera de rango: ${d}`);
  assert.equal(distanciaMetros(13.7, -89.2, 13.7, -89.2), 0);
});
ok('valoración de ubicación por categorías cubiertas', () => {
  const p = (categoria: 'EDUCACION' | 'SALUD' | 'TRANSPORTE' | 'COMERCIO') => ({
    nombre: null, categoria, latitud: 0, longitud: 0, distanciaM: 100,
  });
  assert.equal(evaluarCercania(null).nivel, 'SIN_DATOS');
  assert.equal(evaluarCercania([]).nivel, 'LIMITADA');
  assert.equal(evaluarCercania([p('SALUD'), p('SALUD')]).nivel, 'LIMITADA');
  assert.equal(evaluarCercania([p('SALUD'), p('EDUCACION')]).nivel, 'ACEPTABLE');
  assert.equal(evaluarCercania([p('SALUD'), p('EDUCACION'), p('TRANSPORTE')]).nivel, 'FAVORABLE');
});

// ---- Verificación de vendedor
const doc = (idDocumento: number, tipoDocumento: string, estadoRevision: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO') => ({
  idDocumento, tipoDocumento, estadoRevision,
});
ok('estado de verificación: sin docs, en revisión, verificado, rechazado', () => {
  assert.equal(calcularEstadoVerificacion([]), 'PENDIENTE');
  assert.equal(calcularEstadoVerificacion([doc(1, 'DUI_FRENTE', 'PENDIENTE')]), 'EN_REVISION');
  assert.equal(calcularEstadoVerificacion([doc(1, 'DUI_FRENTE', 'APROBADO'), doc(2, 'DUI_REVERSO', 'PENDIENTE')]), 'EN_REVISION');
  assert.equal(calcularEstadoVerificacion([doc(1, 'DUI_FRENTE', 'APROBADO'), doc(2, 'DUI_REVERSO', 'APROBADO')]), 'VERIFICADO');
  assert.equal(calcularEstadoVerificacion([doc(1, 'DUI_FRENTE', 'RECHAZADO')]), 'RECHAZADO');
});
ok('un documento rechazado se reemplaza al volver a subir el mismo tipo', () => {
  const docs = [doc(1, 'DUI_FRENTE', 'RECHAZADO'), doc(2, 'DUI_FRENTE', 'PENDIENTE')];
  assert.equal(calcularEstadoVerificacion(docs), 'EN_REVISION');
  assert.equal(calcularEstadoVerificacion([...docs.slice(0, 1), doc(2, 'DUI_FRENTE', 'APROBADO')]), 'VERIFICADO');
});
ok('un vendedor VERIFICADO no pierde la verificación al enviar otro documento', () => {
  assert.equal(estadoTrasEnvio('VERIFICADO', [doc(1, 'OTRO', 'PENDIENTE')]), 'VERIFICADO');
  assert.equal(estadoTrasEnvio('PENDIENTE', [doc(1, 'OTRO', 'PENDIENTE')]), 'EN_REVISION');
});

// ---- Comparación (P12)
const t = (idPublicacion: number, precio: number, areaM2: number, tipoOperacion = 'VENTA') => ({
  idPublicacion, titulo: `T${idPublicacion}`, tipoOperacion, precio, estado: 'ACTIVA', disponible: true, areaM2,
  largoM: null, anchoM: null, tipoTerreno: null, caracteristicas: null, departamento: 'X', municipio: 'Y',
  distrito: null, portadaUrl: null, precioPorM2: Math.round((precio / areaM2) * 100) / 100,
});
ok('validar selección: mínimo 2, máximo 4, sin repetidos', () => {
  lanza(() => validarSeleccion([1]));
  lanza(() => validarSeleccion([1, 1]));
  lanza(() => validarSeleccion([1, 2, 3, 4, 5]));
  assert.deepEqual(validarSeleccion([3, 1, 3, 2]), [3, 1, 2]);
});
ok('no se compara una venta con una renta', () => {
  lanza(() => validarMismaOperacion([t(1, 100, 10), t(2, 100, 10, 'RENTA')]));
  validarMismaOperacion([t(1, 100, 10), t(2, 200, 10)]);
});
ok('resumen: menor precio, mayor área, menor precio por m²', () => {
  const r = construirResumen([t(1, 10000, 100), t(2, 8000, 50), t(3, 20000, 400)]);
  assert.deepEqual(r, { menorPrecio: 2, mayorArea: 3, menorPrecioPorM2: 3 });
  assert.equal(construirResumen([]), null);
});

// ---- Cambio de rol (P03)
ok('requisitos de vendedor: lista de pendientes', () => {
  assert.deepEqual(evaluarRequisitosVendedor({ nombreCompleto: 'Ana Pérez', telefono: '7000-1234' }, { dui: '01234567-8', numeroWhatsapp: '7000-1234' }), []);
  const faltan = evaluarRequisitosVendedor({ nombreCompleto: 'Ana Pérez', telefono: null }, { dui: '123', numeroWhatsapp: 'x' });
  assert.equal(faltan.length, 3);
  // Sin DUI ni WhatsApp: ambos aparecen como pendientes (P03 responde 422, no 400)
  const sinDatos = evaluarRequisitosVendedor({ nombreCompleto: 'Ana Pérez', telefono: null }, { dui: '', numeroWhatsapp: null });
  assert.equal(sinDatos.length, 3);
  assert.ok(sinDatos.some((p) => p.includes('WhatsApp')));
});

// ---- Archivos
ok('detección de tipo de archivo por firma (no por nombre)', () => {
  assert.equal(detectarExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpg');
  assert.equal(detectarExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png');
  assert.equal(detectarExtension(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(detectarExtension(Buffer.from('%PDF-1.7')), 'pdf');
  assert.equal(detectarExtension(Buffer.from('<?php echo 1; ?>')), null);
  assert.equal(detectarExtension(Buffer.from('<svg onload=alert(1)>')), null);
  assert.equal(detectarExtension(Buffer.alloc(0)), null);
});
ok('rutas de archivo: solo UUID.ext dentro de carpetas permitidas (anti path-traversal)', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(esRutaArchivoValida(`documentos/${uuid}.pdf`, 'documentos'), true);
  assert.equal(esRutaArchivoValida(`imagenes/${uuid}.jpg`, 'documentos'), false);
  assert.equal(esRutaArchivoValida(`documentos/../../etc/passwd`), false);
  assert.equal(esRutaArchivoValida(`documentos/${uuid}.exe`), false);
  assert.equal(esRutaArchivoValida(`/etc/passwd`), false);
});
