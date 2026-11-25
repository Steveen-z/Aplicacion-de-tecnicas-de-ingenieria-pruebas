# Arquitectura

Arquitectura limpia (Clean Architecture) organizada por módulos de negocio, sobre NestJS 11 (que usa Express como servidor HTTP), Prisma 6 y PostgreSQL 16 con PostGIS.

```
src/
  shared/        errores de dominio, auditoría, paginación, validadores, puertos comunes,
                 guards (JWT/cookie, roles, CSRF), request-id, filtro de excepciones
  modules/<m>/
    domain/          entidades, reglas puras, puertos (interfaces + token Symbol)
    application/     casos de uso (una clase por caso)
    infrastructure/  adaptadores: Prisma, bcrypt, JWT, Overpass, disco local
    presentation/    controladores REST + DTOs (class-validator)
  cli/           comandos de mantenimiento (npm run archivos:limpiar)
  health/        GET /api/health (BD, PostGIS y migraciones)
db/migraciones/  esquema versionado (001…007); db/scriptdb.sql se genera a partir de ellas
```

Regla de dependencia: `presentation → application → domain ← infrastructure`. El dominio no importa NestJS ni Prisma. Los casos de uso se prueban con repositorios falsos (`test/*.spec.ts`).

## Módulos y procesos (numeración del Lab3)
| Módulo | Procesos |
|---|---|
| auth | P01 registrar vendedor, P02 registrar cliente, login/logout/refresh, sesión por cookie + CSRF, editar perfil propio |
| cambio-rol | P03 solicitar cambio de rol (422 con `requisitosPendientes`; registra solicitudes rechazadas) |
| publicaciones | P04 consultar, P05 filtrar (incluye cercanía con PostGIS y tipo de inmueble), P06 detalle y ubicación, P07 contacto WhatsApp, P08 publicar (casa/lote/terreno), P09 gestionar, P11 precio y aviso de baja |
| favoritos | P10 |
| comparaciones | P12 (2–4 inmuebles de la misma operación y el mismo tipo) |
| administracion | gestión de usuarios (bloquear/reactivar), moderación de publicaciones, consulta de auditoría (solo ADMIN) |
| verificacion | documentos del vendedor revisados por ADMIN (auditado) |
| archivos | subida validada por firma binaria, registro con dueño, limpieza de huérfanos |
| notificaciones | avisos internos (baja de precio, moderación) |

## Decisiones
- **NestJS sobre Express**: el documento de arquitectura del equipo menciona "Node.js con Express"; NestJS usa Express (`@nestjs/platform-express`) y aporta inyección de dependencias y módulos, que sostienen las capas.
- **Esquema versionado** con scripts SQL numerados (`db/migraciones/`, tabla `schema_migraciones`, `npm run db:migrar`). Cada migración es transaccional y aborta si ya se aplicó. `db/scriptdb.sql` se genera concatenándolas (`npm run db:generar-script`) y una prueba detecta si quedó desactualizado. Prisma solo genera el cliente.
- **PostGIS**: `ubicaciones.punto_publico` y `punto_exacto` son columnas `geography(Point,4326)` **generadas** a partir de las coordenadas decimales (no pueden desincronizarse); índice GiST sobre el punto público; la búsqueda usa `ST_DWithin` con centro y radio (0,1–50 km).
- **Ubicación aproximada**: el público y las búsquedas solo usan el punto redondeado a 2 decimales (~1 km); el exacto solo lo ven el dueño y el administrador. Por eso `distanciaKm` es aproximada.
- **Tipos de inmueble**: `publicaciones.tipo_propiedad` (CASA, LOTE, TERRENO) y campos de casa con un CHECK que los exige en CASA y los prohíbe en los demás; la tabla `terrenos` describe el predio de toda publicación. No se comparan inmuebles de distinto tipo.
- **Sesión**: JWT con `jti` y hash sha256 en `sesiones` (revocable). El frontend usa la cookie HttpOnly `inmobisv_sesion` y envía `X-CSRF-Token` (HMAC del valor de la cookie, sin estado); Swagger y los scripts usan `Authorization: Bearer`, que no necesita CSRF. CORS con credenciales y orígenes explícitos.
- **Transacciones y concurrencia**: precio + historial + avisos de baja en una sola transacción (`FOR UPDATE`; UNIQUE por usuario e historial); bloqueo de usuario con `FOR UPDATE` y cierre de sesiones; moderación, cambio de estado del vendedor y revisión de documentos con UPDATE condicional (409 ante un cambio concurrente).
- **Auditoría**: tabla `auditoria` de solo inserción (triggers contra UPDATE/DELETE/TRUNCATE); cada acción administrativa la escribe dentro de su propia transacción.
- **Archivos**: tabla `archivos` con dueño; fotos y documentos solo pueden referenciar archivos propios (FK a la ruta = clave del objeto). Almacenamiento en disco local detrás del puerto `FileStorage` (intercambiable por S3). Las URLs externas antiguas se conservan marcadas como externas.
- **Observabilidad**: `X-Request-Id` en respuestas y errores; log de acceso JSON por petición; WARN en bloqueos, moderación y rechazos CSRF; `/api/health` responde 503 si falta la BD, PostGIS o alguna migración.
- **Seguridad**: bcrypt cost 12, helmet, throttling (login 5/min, registro 10/min, subidas 30/min), ValidationPipe estricto (campos extra → 400), validación de archivos por firma binaria, ids BigInt convertidos a `number` en los adaptadores.

## Diseño detallado
El diseño de la fase 2 (seis pasos: contexto, datos, fallos, autorización, concurrencia y observabilidad) está en [diseno-fase2.md](diseno-fase2.md).
