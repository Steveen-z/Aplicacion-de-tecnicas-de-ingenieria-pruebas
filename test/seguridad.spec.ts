import assert from 'node:assert/strict';
import { it } from 'node:test';
import { validateEnv } from '../src/config/env.validation';
import { TokenCsrf, decidirCsrf, leerCookie, opcionesCookie } from '../src/shared/infrastructure/security/session-cookie';
import { cookieSegura } from '../src/shared/infrastructure/security/sesion-web.service';

const csrf = new TokenCsrf('x'.repeat(40));
const ORIGENES = ['http://localhost:5173'];
const base = { metodo: 'PATCH', tieneBearer: false, cookieSesion: 'jwt.de.prueba', origin: undefined, tokenCsrf: undefined, exenta: false };

it('leerCookie: encuentra la cookie entre varias y tolera valores raros', () => {
  assert.equal(leerCookie('a=1; inmobisv_sesion=abc.def; b=2', 'inmobisv_sesion'), 'abc.def');
  assert.equal(leerCookie('inmobisv_sesionX=1', 'inmobisv_sesion'), null);
  assert.equal(leerCookie(undefined, 'inmobisv_sesion'), null);
  assert.equal(leerCookie('inmobisv_sesion=%E0%A4%A', 'inmobisv_sesion'), null);
});

it('token CSRF: válido para su cookie, inválido alterado, de otra cookie o con otro secreto', () => {
  const t = csrf.generar('cookie-1');
  assert.equal(csrf.verificar('cookie-1', t), true);
  assert.equal(csrf.verificar('cookie-1', t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')), false);
  assert.equal(csrf.verificar('cookie-2', t), false);
  assert.equal(new TokenCsrf('y'.repeat(40)).verificar('cookie-1', t), false);
  assert.equal(csrf.verificar('cookie-1', undefined), false);
});

it('CSRF: métodos seguros, Bearer, exentas y sin cookie pasan', () => {
  assert.equal(decidirCsrf({ ...base, metodo: 'GET' }, ORIGENES, csrf), null);
  assert.equal(decidirCsrf({ ...base, tieneBearer: true }, ORIGENES, csrf), null);
  assert.equal(decidirCsrf({ ...base, exenta: true }, ORIGENES, csrf), null);
  assert.equal(decidirCsrf({ ...base, cookieSesion: null }, ORIGENES, csrf), null);
});

it('CSRF con cookie: exige token válido y origen permitido', () => {
  assert.match(decidirCsrf(base, ORIGENES, csrf)!, /CSRF/);
  assert.match(decidirCsrf({ ...base, tokenCsrf: 'falso' }, ORIGENES, csrf)!, /CSRF/);
  const valido = csrf.generar(base.cookieSesion);
  assert.equal(decidirCsrf({ ...base, tokenCsrf: valido }, ORIGENES, csrf), null);
  assert.equal(decidirCsrf({ ...base, tokenCsrf: valido, origin: 'http://localhost:5173' }, ORIGENES, csrf), null);
  assert.match(decidirCsrf({ ...base, tokenCsrf: valido, origin: 'https://evil.example' }, ORIGENES, csrf)!, /Origen/);
});

it('cookie: HttpOnly, Path=/api, Secure según entorno', () => {
  const o = opcionesCookie({ secure: false, sameSite: 'lax', ttlSegundos: 60 });
  assert.deepEqual(o, { httpOnly: true, secure: false, sameSite: 'lax', path: '/api', maxAge: 60000 });
  assert.equal(cookieSegura(undefined, 'production'), true);
  assert.equal(cookieSegura(undefined, 'development'), false);
  assert.equal(cookieSegura('true', 'development'), true);
  assert.equal(cookieSegura('false', 'production'), false);
});

it('validateEnv: rechaza SameSite=none sin Secure y CORS con *', () => {
  const ok = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 's'.repeat(32) };
  validateEnv({ ...ok });
  validateEnv({ ...ok, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'true' });
  assert.throws(() => validateEnv({ ...ok, COOKIE_SAMESITE: 'none' }), /COOKIE_SECURE/);
  assert.throws(() => validateEnv({ ...ok, COOKIE_SAMESITE: 'otro' }), /COOKIE_SAMESITE/);
  assert.throws(() => validateEnv({ ...ok, CORS_ORIGINS: 'http://a.com, *' }), /CORS_ORIGINS/);
});
