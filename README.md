# InmobiSV – Backend

**Versión 1.1.0** · Proyecto de Ingeniería de Software, Universidad de Oriente. Cambios por versión en [CHANGELOG.md](CHANGELOG.md).

## Descripción

InmobiSV es una plataforma para publicar, buscar, comparar y contactar vendedores de inmuebles (casas, lotes y terrenos) en El Salvador. Este repositorio contiene el backend (API REST): registro y sesiones, cambio de rol cliente→vendedor, publicaciones con fotografías y historial de precios, filtros, favoritos, comparación de terrenos, notificaciones y verificación de vendedores. La interacción se hace desde el frontend o, para demostración, desde Swagger en `/api/docs`.

## Tecnologías

NestJS 11 (sobre Express) · Prisma 6 · TypeScript · PostgreSQL 16 + PostGIS 3 · JWT (Bearer y cookie HttpOnly con CSRF) · bcrypt · Swagger · Docker Compose · Arquitectura limpia por módulo.

## Requisitos

- Node.js 20 o superior y npm (verificado con Node 22).
- PostgreSQL 16 (o Docker con Docker Compose para levantarlo).
- Para el script de pruebas funcionales: `bash`, `curl` y `jq`.

## Documentación técnica

Carpeta [`docs/`](docs): [arquitectura](docs/arquitectura.md), [pruebas](docs/pruebas.md) (unitarias, registro funcional, errores y correcciones), [ISO/IEC 25010](docs/iso25010.md) y [flujo Git del equipo](docs/colaboracion-git.md). Cambios por versión en [CHANGELOG.md](CHANGELOG.md).

## Pruebas

```bash
npm test                              # 82 pruebas unitarias: dominio, casos de uso con repositorios falsos, seguridad y esquema
bash scripts/pruebas-funcionales.sh   # F01–F56 contra la API levantada (requiere el admin del seed; PRUEBA_LIMPIEZA=1 incluye F56)
```

Resultados registrados en [docs/pruebas.md](docs/pruebas.md) (última ejecución: 2026-11-25 sobre una base nueva, 82/82 unitarias y 61/61 comprobaciones funcionales). El script crea datos de prueba; el límite de login es 5/min, así que para repetirlo seguido espera un minuto o reinicia la API.

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

**PostGIS (obligatorio desde la migración 002).** La búsqueda por cercanía usa la extensión PostGIS:
- Windows: menú Inicio → PostgreSQL 16 → **Application Stack Builder** → elige tu servidor (puerto 5432) → *Spatial Extensions* → **PostGIS 3.x Bundle for PostgreSQL 16** → instalar con las opciones por defecto. Comprueba en pgAdmin o psql: `SELECT name, default_version FROM pg_available_extensions WHERE name = 'postgis';`
- Ubuntu/Debian: `sudo apt install postgresql-16-postgis-3`. macOS (Homebrew): `brew install postgis`.
- Docker: la imagen `postgis/postgis:16-3.4` ya lo incluye.
- La migración 002 crea la extensión; si PostGIS no está instalado, falla con un mensaje claro y `GET /api/health` responde 503 indicándolo.

- El esquema se versiona con scripts SQL numerados en `db/migraciones/` (`001_inicial.sql`, `002_...`). Cada uno corre en una transacción, se registra en la tabla `schema_migraciones` y, si se reejecuta, aborta sin cambiar nada.
- `npm run db:migrar` aplica las pendientes con `psql` (lee `DATABASE_URL` del `.env`). También pueden abrirse y ejecutarse en orden desde el Query Tool de pgAdmin.
- `db/scriptdb.sql` es **generado** (concatenación de todas las migraciones) para crear una base nueva de una vez. No se edita a mano: para cambiar el esquema se crea una migración nueva y se ejecuta `npm run db:generar-script`; `npm test` falla si quedó desactualizado.
- **Base creada antes de las migraciones** (con el `scriptdb.sql` de v1.0.0): ejecuta una vez `npm run db:migrar -- --baseline 001` y luego `npm run db:migrar`.
- Regla del equipo: una migración ya integrada en `main` no se modifica; se corrige con otra nueva.
- Prisma solo se usa para `generate`. No ejecutes `prisma migrate`.
- Docker usa la imagen `postgis/postgis:16-3.4` y aplica las migraciones solo cuando el volumen es nuevo; para reiniciar: `docker compose down -v && docker compose up -d` y vuelve a correr `npm run db:seed`.

### Mantenimiento: archivos sin uso

`npm run archivos:limpiar` borra las imágenes y documentos subidos que nadie usa desde hace más de 24 h (y archivos del disco sin registro). `-- --simulacion` solo informa; `-- --horas 48` cambia la antigüedad. Se puede repetir sin riesgo y programar (cron o Programador de tareas de Windows).

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
| P04 Consultar / P05 Filtrar | `GET /publicaciones` (filtros: `departamento`, `municipio`, `tipoOperacion`, `precioMin/Max`, `areaMin/Max`, `q`, `tipoPropiedad`, `habitacionesMin`/`banosMin` (solo casas), `orden`, `page`, `limit`; **cercanía**: `lat`, `lng`, `radioKm` (0,1–50) juntos y `orden=DISTANCIA`). Cada item trae `latitud`/`longitud` públicas (aproximadas, para el mapa) y `distanciaKm` | Público |
| P06 Detalle y ubicación | `GET /publicaciones/:id`, `GET /publicaciones/:id/historial-precios` | Público (exactas solo dueño/admin) |
| P07 Contacto WhatsApp | `GET /publicaciones/:id/whatsapp` | Autenticado |
| P08 Publicar | `POST /publicaciones` (`tipoPropiedad`: `CASA`/`LOTE`/`TERRENO`, por defecto TERRENO; una CASA exige `casa.habitaciones`, `casa.banos` y `casa.areaConstruidaM2`), fotografías (`POST/DELETE /publicaciones/:id/fotografias…`, `PATCH …/portada`) | VENDEDOR |
| P09 Gestionar | `GET /publicaciones/mias`, `PATCH /publicaciones/:id`, `POST /publicaciones/:id/pausar｜reactivar｜marcar-vendida｜marcar-rentada` | VENDEDOR dueño |
| P10 Favoritos | `GET /favoritos`, `POST /favoritos/:id/alternar`, `DELETE /favoritos/:id` | Autenticado |
| P11 Precio y aviso de baja | `PATCH /publicaciones/:id/precio` | VENDEDOR dueño |
| P12 Comparación | `POST /comparaciones` (2–4 ids, misma operación y mismo tipo de inmueble), `GET /comparaciones`, `GET /comparaciones/:id` | Usuario con perfil cliente |
| Notificaciones | `GET /notificaciones`, `GET /notificaciones/no-leidas/conteo`, `PATCH /notificaciones/leer-todas`, `PATCH /notificaciones/:id/leida` | Autenticado |
| Archivos | `POST /archivos/imagenes` (campo `archivo`, JPG/PNG/WEBP ≤5 MB), `POST /archivos/documentos` (PDF/JPG/PNG ≤8 MB, privado) | VENDEDOR (imágenes también ADMIN) |
| Verificación | `POST/GET /vendedores/me/documentos`; admin: `GET /admin/documentos`, `GET /admin/documentos/:id/archivo`, `PATCH /admin/documentos/:id/revision` | VENDEDOR / ADMIN |
| Perfil propio | `PATCH /auth/me` (`nombreCompleto`, `telefono`) | Autenticado |
| Admin: usuarios | `GET /admin/usuarios` (`rol`, `estado`, `q`), `PATCH /admin/usuarios/:id/estado` (`ACTIVA`/`BLOQUEADA` + `motivo`; bloquear cierra sus sesiones y oculta sus publicaciones) | ADMIN |
| Admin: moderación | `GET /admin/publicaciones` (cualquier estado), `PATCH /admin/publicaciones/:id/moderacion` (`RECHAZAR` con `motivo` / `RESTAURAR`; el vendedor recibe una notificación) | ADMIN |
| Admin: auditoría | `GET /admin/auditoria` (`accion`, `entidad`, `idEntidad`, `idActor`, `desde`, `hasta`): bloqueos, activaciones, rechazos, restauraciones y revisiones de documentos; la tabla no admite cambios ni borrados | ADMIN |

## Notas para el frontend

- Autenticación del **frontend**: cookie HttpOnly `inmobisv_sesion` (la pone la API en login/registro/refresh; usar `fetch(..., { credentials: 'include' })`). En POST/PATCH/PUT/DELETE enviar la cabecera `X-CSRF-Token` con el `csrfToken` de la respuesta de login (o de `GET /auth/csrf` tras recargar la página); guardarlo en memoria e **ignorar** el `token` del cuerpo. El origen del frontend debe estar en `CORS_ORIGINS`.
- Autenticación de **Swagger y scripts**: `Authorization: Bearer <token>` (el `token` del cuerpo); no necesita CSRF.
- Errores: JSON con código HTTP, mensaje y, cuando aplica, `details` (p. ej. `requisitosPendientes` en P03). 400 = formato de la petición; 422 = regla de negocio.
- P03: si el cliente se registró sin teléfono puede enviarlo en la misma solicitud (`telefono`).
- Subir fotos: `POST /archivos/imagenes` → usar el `url` devuelto en `fotografias[].urlImagen` al crear/editar la publicación. Solo se aceptan imágenes subidas a la plataforma por el mismo vendedor (URL externa → 422; imagen de otro usuario → 403). Lo mismo aplica a los documentos de verificación.
- Las coordenadas exactas solo las ve el dueño; el público recibe coordenadas aproximadas.

## Decisiones y límites

- Almacenamiento en disco local (`UPLOAD_DIR`); para producción, implementar otro adaptador de `FileStorage` (p. ej. S3).
- Puntos de interés cercanos vía Overpass (OpenStreetMap); si falla, la valoración queda como `SIN_DATOS`.
- El DUI se valida solo por formato (`########-#`), sin dígito verificador.
- P03: el cambio de rol se aplica automáticamente al cumplir requisitos (sin aprobación de administrador).
- Las notificaciones son internas (tabla `notificaciones`): no se envían correos ni push.
- Al bloquear un usuario sus publicaciones se ocultan (no se modifican); al reactivarlo reaparecen.
- La distancia de la búsqueda por cercanía se mide contra el punto público (~1 km de precisión), así que es aproximada.
- Las pruebas unitarias cubren dominio y casos de uso; los repositorios Prisma se verifican con el script funcional contra una BD real, no con pruebas de integración automatizadas.
- El frontend (React + Vite, según el documento de arquitectura) todavía no existe en este repositorio.
