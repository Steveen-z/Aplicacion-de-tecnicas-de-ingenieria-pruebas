# InmobiSV – Backend

**Versión 1.0.0** · Proyecto de Ingeniería de Software, Universidad de Oriente.

## Descripción

InmobiSV es una plataforma para publicar, buscar, comparar y contactar vendedores de terrenos en El Salvador. Este repositorio contiene el backend (API REST): registro y sesiones, cambio de rol cliente→vendedor, publicaciones con fotografías y historial de precios, filtros, favoritos, comparación de terrenos, notificaciones y verificación de vendedores. La interacción se hace desde el frontend o, para demostración, desde Swagger en `/api/docs`.

## Tecnologías

NestJS 11 · Prisma 6 · TypeScript · PostgreSQL 16 · JWT · bcrypt · Swagger · Docker Compose · Arquitectura limpia por módulo.

## Requisitos

- Node.js 20 o superior y npm (verificado con Node 22).
- PostgreSQL 16 (o Docker con Docker Compose para levantarlo).
- Para el script de pruebas funcionales: `bash`, `curl` y `jq`.

## Documentación técnica

Carpeta [`docs/`](docs): [arquitectura](docs/arquitectura.md), [pruebas](docs/pruebas.md) (unitarias, registro funcional, errores y correcciones), [ISO/IEC 25010](docs/iso25010.md) y [flujo Git del equipo](docs/colaboracion-git.md). Cambios por versión en [CHANGELOG.md](CHANGELOG.md).

## Pruebas

```bash
npm test                              # 38 pruebas unitarias: dominio + casos de uso con repositorios falsos
bash scripts/pruebas-funcionales.sh   # F01–F22 contra la API levantada (requiere el admin del seed)
```

Resultados registrados en [docs/pruebas.md](docs/pruebas.md) (última ejecución: 2026-11-25, 38/38 unitarias y 26/26 comprobaciones funcionales).

## Puesta en marcha

```bash
# 1. Base de datos vacía (PostgreSQL 16 local con psql en el PATH, o Docker)
psql -U postgres -c "CREATE DATABASE plataforma_terrenos;"
#    con Docker: docker compose up -d   (crea la base y aplica las migraciones)

# 2. Variables de entorno
cp .env.example .env        # DATABASE_URL usa postgres/123 (cámbiala si tu contraseña es otra) y cambia JWT_SECRET (mín. 32 caracteres)

# 3. Dependencias y cliente Prisma
npm install                 # ejecuta `prisma generate` en postinstall
npm run typecheck && npm run build   # opcional: comprobar que compila

# 3b. Esquema: aplica en orden las migraciones pendientes de db/migraciones/
npm run db:migrar           # npm run db:migrar -- --estado  muestra aplicadas/pendientes

# 4. Usuario administrador inicial (ADMIN_EMAIL / ADMIN_PASSWORD del .env)
npm run db:seed

# 5. Arrancar
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs` (solo fuera de producción)
- Salud: `GET /api/health`

### Base de datos y migraciones

- El esquema se versiona con scripts SQL numerados en `db/migraciones/` (`001_inicial.sql`, `002_...`). Cada uno corre en una transacción, se registra en la tabla `schema_migraciones` y, si se reejecuta, aborta sin cambiar nada.
- `npm run db:migrar` aplica las pendientes con `psql` (lee `DATABASE_URL` del `.env`). También pueden abrirse y ejecutarse en orden desde el Query Tool de pgAdmin.
- `db/scriptdb.sql` es **generado** (concatenación de todas las migraciones) para crear una base nueva de una vez. No se edita a mano: para cambiar el esquema se crea una migración nueva y se ejecuta `npm run db:generar-script`; `npm test` falla si quedó desactualizado.
- **Base creada antes de las migraciones** (con el `scriptdb.sql` de v1.0.0): ejecuta una vez `npm run db:migrar -- --baseline 001` y luego `npm run db:migrar`.
- Regla del equipo: una migración ya integrada en `main` no se modifica; se corrige con otra nueva.
- Prisma solo se usa para `generate`. No ejecutes `prisma migrate`.
- Docker usa la imagen `postgis/postgis:16-3.4` y aplica las migraciones solo cuando el volumen es nuevo; para reiniciar: `docker compose down -v && docker compose up -d` y vuelve a correr `npm run db:seed`.

Producción: `npm run build && npm run start:prod` con `NODE_ENV=production` (Swagger se desactiva).

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

Numeración de procesos según el documento Lab3.

| Proceso | Método y ruta | Acceso |
|---|---|---|
| P01 Registrar vendedor | `POST /auth/registro/vendedor` | Público |
| P02 Registrar cliente | `POST /auth/registro/cliente` | Público |
| Sesión | `POST /auth/login`, `/auth/logout`, `/auth/refresh`, `GET /auth/me` | Público / autenticado |
| P03 Cambio de rol | `POST /cambio-rol/solicitudes` (`dui`, `numeroWhatsapp?`, `telefono?`), `GET /cambio-rol/solicitudes` | CLIENTE |
| P04 Consultar / P05 Filtrar | `GET /publicaciones` (filtros: `departamento`, `municipio`, `tipoOperacion`, `precioMin/Max`, `areaMin/Max`, `q`, `orden`, `page`, `limit`) | Público |
| P06 Detalle y ubicación | `GET /publicaciones/:id`, `GET /publicaciones/:id/historial-precios` | Público (exactas solo dueño/admin) |
| P07 Contacto WhatsApp | `GET /publicaciones/:id/whatsapp` | Autenticado |
| P08 Publicar | `POST /publicaciones`, fotografías (`POST/DELETE /publicaciones/:id/fotografias…`, `PATCH …/portada`) | VENDEDOR |
| P09 Gestionar | `GET /publicaciones/mias`, `PATCH /publicaciones/:id`, `POST /publicaciones/:id/pausar｜reactivar｜marcar-vendida｜marcar-rentada` | VENDEDOR dueño |
| P10 Favoritos | `GET /favoritos`, `POST /favoritos/:id/alternar`, `DELETE /favoritos/:id` | Autenticado |
| P11 Precio y aviso de baja | `PATCH /publicaciones/:id/precio` | VENDEDOR dueño |
| P12 Comparación | `POST /comparaciones` (2–4 ids, misma operación), `GET /comparaciones`, `GET /comparaciones/:id` | Usuario con perfil cliente |
| Notificaciones | `GET /notificaciones`, `GET /notificaciones/no-leidas/conteo`, `PATCH /notificaciones/leer-todas`, `PATCH /notificaciones/:id/leida` | Autenticado |
| Archivos | `POST /archivos/imagenes` (campo `archivo`, JPG/PNG/WEBP ≤5 MB), `POST /archivos/documentos` (PDF/JPG/PNG ≤8 MB, privado) | VENDEDOR (imágenes también ADMIN) |
| Verificación | `POST/GET /vendedores/me/documentos`; admin: `GET /admin/documentos`, `GET /admin/documentos/:id/archivo`, `PATCH /admin/documentos/:id/revision` | VENDEDOR / ADMIN |

## Notas para el frontend

- Autenticación del **frontend**: cookie HttpOnly `inmobisv_sesion` (la pone la API en login/registro/refresh; usar `fetch(..., { credentials: 'include' })`). En POST/PATCH/PUT/DELETE enviar la cabecera `X-CSRF-Token` con el `csrfToken` de la respuesta de login (o de `GET /auth/csrf` tras recargar la página); guardarlo en memoria e **ignorar** el `token` del cuerpo. El origen del frontend debe estar en `CORS_ORIGINS`.
- Autenticación de **Swagger y scripts**: `Authorization: Bearer <token>` (el `token` del cuerpo); no necesita CSRF.
- Errores: JSON con código HTTP, mensaje y, cuando aplica, `details` (p. ej. `requisitosPendientes` en P03). 400 = formato de la petición; 422 = regla de negocio.
- P03: si el cliente se registró sin teléfono puede enviarlo en la misma solicitud (`telefono`).
- Subir fotos: `POST /archivos/imagenes` → usar el `url` devuelto en `fotografias[].urlImagen` al crear/editar la publicación.
- Las coordenadas exactas solo las ve el dueño; el público recibe coordenadas aproximadas.

## Decisiones y límites

- Almacenamiento en disco local (`UPLOAD_DIR`); para producción, implementar otro adaptador de `FileStorage` (p. ej. S3).
- Puntos de interés cercanos vía Overpass (OpenStreetMap); si falla, la valoración queda como `SIN_DATOS`.
- El DUI se valida solo por formato (`########-#`), sin dígito verificador.
- P03: el cambio de rol se aplica automáticamente al cumplir requisitos (sin aprobación de administrador).
- Las notificaciones de baja de precio no son atómicas con la actualización del precio.
- Las pruebas unitarias cubren dominio y casos de uso; los repositorios Prisma se verifican con el script funcional contra una BD real, no con pruebas de integración automatizadas.
- No existe endpoint para editar el perfil (nombre/teléfono) fuera de P03.
