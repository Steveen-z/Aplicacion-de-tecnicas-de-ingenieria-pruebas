# InmobiSV – Backend

**Versión 1.0.0** · Proyecto de Ingeniería de Software, Universidad de Oriente.

## Descripción

InmobiSV es una plataforma para publicar, buscar, comparar y contactar vendedores de terrenos en El Salvador. Este repositorio contiene el backend (API REST): registro y sesiones, cambio de rol cliente→vendedor, publicaciones con fotografías y historial de precios, filtros, favoritos, comparación de terrenos, notificaciones y verificación de vendedores. La interacción se hace desde el frontend o, para demostración, desde Swagger en `/api/docs`.

## Tecnologías

NestJS 11 · Prisma 6 · TypeScript · PostgreSQL 16 · JWT · bcrypt · Swagger · Docker Compose · Arquitectura limpia por módulo.

## Requisitos

Node.js 20+, npm, PostgreSQL 14+ (o Docker).

## Documentación técnica

Carpeta [`docs/`](docs): [arquitectura](docs/arquitectura.md), [pruebas](docs/pruebas.md) (unitarias, registro funcional, errores y correcciones), [ISO/IEC 25010](docs/iso25010.md) y [flujo Git del equipo](docs/colaboracion-git.md). Cambios por versión en [CHANGELOG.md](CHANGELOG.md).

## Pruebas

```bash
npm test      # pruebas unitarias del dominio (node:test)
```

## Puesta en marcha

```bash
# 1. Base de datos (crea el esquema con db/scriptdb.sql)
docker compose up -d
#    o bien ejecuta db/scriptdb.sql en tu PostgreSQL

# 2. Variables de entorno
cp .env.example .env        # ajusta DATABASE_URL y JWT_SECRET (mín. 32 caracteres)

# 3. Dependencias y cliente Prisma
npm install                 # ejecuta `prisma generate` en postinstall

# 4. Usuario administrador inicial (ADMIN_EMAIL / ADMIN_PASSWORD del .env)
npm run db:seed

# 5. Arrancar
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs` (solo fuera de producción)
- Salud: `GET /api/health`

> Prisma solo se usa para `generate`; el esquema lo gobierna `db/scriptdb.sql`. No ejecutes `prisma migrate`.

## Arquitectura

Cada módulo en `src/modules/<modulo>/` se divide en:

| Capa | Contenido |
|---|---|
| `domain` | Entidades, reglas de negocio puras, puertos (interfaces con token Symbol) |
| `application` | Casos de uso (una clase por caso) |
| `infrastructure` | Adaptadores: repositorios Prisma, bcrypt, JWT, Overpass, almacenamiento |
| `presentation` | Controladores y DTOs (class-validator) |

Las dependencias apuntan hacia el dominio. Los errores de dominio (`NotFound` 404, `Conflict` 409, `BusinessRule` 422, `Unauthorized` 401, `Forbidden` 403) los traduce `AllExceptionsFilter`.

## Endpoints (prefijo `/api`)

| Proceso | Método y ruta | Acceso |
|---|---|---|
| P01 Registro cliente | `POST /auth/registro/cliente` | Público |
| P02 Registro vendedor | `POST /auth/registro/vendedor` | Público |
| Sesión | `POST /auth/login`, `/auth/logout`, `/auth/refresh`, `GET /auth/me` | Público / autenticado |
| P03 Cambio de rol | `POST /cambio-rol/solicitudes`, `GET /cambio-rol/solicitudes` | CLIENTE |
| P04–P08 Publicaciones | `GET /publicaciones`, `GET /publicaciones/mias`, `GET /publicaciones/:id`, `POST /publicaciones`, `PATCH /publicaciones/:id`, `PATCH /publicaciones/:id/precio`, `GET /publicaciones/:id/historial-precios`, fotografías (`POST/DELETE /publicaciones/:id/fotografias…`, `PATCH …/portada`) | Lectura pública; escritura VENDEDOR |
| P09 Estado | `POST /publicaciones/:id/pausar｜reactivar｜marcar-vendida｜marcar-rentada` | VENDEDOR dueño |
| P11 Contacto | `GET /publicaciones/:id/whatsapp` | Autenticado |
| P10 Favoritos | `GET /favoritos`, `POST /favoritos/:id/alternar`, `DELETE /favoritos/:id` | Autenticado |
| P12 Comparación | `POST /comparaciones`, `GET /comparaciones`, `GET /comparaciones/:id` | Autenticado |
| Notificaciones | `GET /notificaciones`, `GET /notificaciones/no-leidas/conteo`, `PATCH /notificaciones/leer-todas`, `PATCH /notificaciones/:id/leida` | Autenticado |
| Archivos | `POST /archivos/imagenes` (campo `archivo`, ≤5 MB), `POST /archivos/documentos` (≤8 MB, privado) | VENDEDOR |
| Verificación | `POST/GET /vendedores/me/documentos`; admin: `GET /admin/documentos`, `GET /admin/documentos/:id/archivo`, `PATCH /admin/documentos/:id/revision` | VENDEDOR / ADMIN |

## Notas para el frontend

- Autenticación: `Authorization: Bearer <token>` (el token se devuelve en login/registro).
- Errores: JSON con código HTTP, mensaje y, cuando aplica, `details` (p. ej. `requisitosPendientes` en P03).
- Subir fotos: `POST /archivos/imagenes` → usar el `url` devuelto en `fotografias[].urlImagen` al crear/editar la publicación.
- Las coordenadas exactas solo las ve el dueño; el público recibe coordenadas aproximadas.

## Decisiones y límites

- Almacenamiento en disco local (`UPLOAD_DIR`); para producción, implementar otro adaptador de `FileStorage` (p. ej. S3).
- Puntos de interés cercanos vía Overpass (OpenStreetMap); si falla, la valoración queda como `SIN_DATOS`.
- El DUI se valida solo por formato (`########-#`), sin dígito verificador.
- P03: el cambio de rol se aplica automáticamente al cumplir requisitos (sin aprobación de administrador).
- Las notificaciones de baja de precio no son atómicas con la actualización del precio.
- No hay pruebas automatizadas de integración; la lógica de dominio se verificó con comprobaciones puntuales.
