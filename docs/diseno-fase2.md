## Diseño de componentes: Paquete de cambios backend InmobiSV (A–H)

Documento de blueprint, sin código de producción. Se leyó el código real (src/modules/*, src/shared/*, db/scriptdb.sql, prisma/schema.prisma, test/*, scripts/pruebas-funcionales.sh, docs/*, docker-compose.yml, main.ts). Las referencias son `ruta:línea`.

### 0. Hallazgos en el código que condicionan el diseño

| # | Hallazgo | Consecuencia |
|---|---|---|
| 1 | `cambiarEstado` hace un UPDATE incondicional (`src/modules/publicaciones/infrastructure/prisma-publicacion.repository.ts:136-141`). | El vendedor puede pisar un RECHAZAR del admin. Hay que volverlo condicional (`WHERE estado = desde`). Va en el PR de moderación. |
| 2 | `ValidarSesionUseCase` ya rechaza cuentas no ACTIVA en cada petición (`src/modules/auth/application/use-cases/validar-sesion.use-case.ts:20`). El login ya responde 403 si la cuenta está bloqueada (`iniciar-sesion.use-case.ts:31`). | Cerrar las sesiones al bloquear es defensa en profundidad y deja el rastro en `sesiones`. No cambia el comportamiento visible. |
| 3 | `FotografiaDto.urlImagen` acepta cualquier URL http/https (`publicaciones.dto.ts:109-114`). `EnviarDocumento` acepta la ruta de cualquier usuario (`verificacion.use-cases.ts:29`). | Se aplica la validación de propiedad en ambos (F). |
| 4 | `revisarDocumento` hace lectura previa y luego UPDATE sin condición (`prisma-documento.repository.ts:77-95`). | Dos admins concurrentes pasan la verificación y duplicarían la auditoría. Se cambia a `updateMany WHERE estado_revision='PENDIENTE'` y, si no actualiza nada, 409. |
| 5 | El punto público está redondeado a 2 decimales, celdas de ~1 km (`publicacion.rules.ts:66-75`). | `distanciaKm` es aproximada. Con `radioKm` < 1 los resultados quedan cuantizados. Se documenta como riesgo. |
| 6 | `postgres:16` (`docker-compose.yml:5`) no trae PostGIS. | La imagen debe pasar a `postgis/postgis:16-3.4`. |
| 7 | El rol de base de datos es `CLIENTE`, no "comprador" (`scriptdb.sql:23-24`). | Se mantiene `CLIENTE`. No se crea otro rol. |
| 8 | `tsx` (esbuild) no emite metadata de decoradores. Nest depende de ella en `PrismaService` y similares. | El CLI de limpieza usa `ts-node --transpile-only`, igual que `db:seed` (`package.json:20`). No usa `tsx`. |
| 9 | `ActualizarPrecioUseCase` notifica después de la transacción, dentro de un try/catch que se traga el error (`actualizar-precio.use-case.ts:51-66`). | Es el defecto de G. El fake `NotifierFalso` (`test/casos-de-uso.spec.ts:350-358`) desaparece con el puerto. |
| 10 | El detalle ya usa solo el punto público para el mapa y las coordenadas. La vista de detalle ya oculta las exactas (`vistas.ts:21-36`). | El listado debe seguir la misma convención: `latitud` y `longitud` públicas, y nunca `*Exacta`. |

---

### 1. Contexto

Es un conjunto de 8 cambios sobre el monolito NestJS 11 / Prisma 6 / PostgreSQL 16, con carga de prototipo (<5 req/s, cientos de publicaciones).

- **Endpoints HTTP síncronos:** A (lectura pública), B (perfil), C y D (administración), E (lectura de auditoría), F (subidas) y H (sesión).
- **CLI batch:** el script de limpieza de archivos (F).
- **Cambio transversal:** los scripts SQL versionados.

**Modelo de fallos:**
- Errores de dominio traducidos por `AllExceptionsFilter`: 404, 409, 422, 401, 403. El 400 queda para la forma de la petición (DTO).
- Todo cambio con efectos múltiples va en una única transacción de BD y se revierte entero si falla.
- No hay workers ni colas. Las notificaciones son filas internas y no hay efectos externos que requieran outbox.

**Modelo de concurrencia:**
- Un solo proceso Node con un pool de Prisma.
- Los conflictos entre actores (admin vs. vendedor, admin vs. admin, vendedor vs. vendedor) se resuelven en la BD con bloqueo de fila o UPDATE condicional.
- El CLI puede coincidir con tráfico y es idempotente.

**Decisiones de arquitectura transversales (tomadas, con alternativa en una línea):**

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Tipos de inmueble | `publicaciones.tipo_propiedad` más columnas de casa nullable en `publicaciones`, con un CHECK que ata ambas cosas. `terrenos` sigue siendo el predio de todas las publicaciones. | Tabla `casas` 1:1. Exige una constraint trigger diferida para el "obligatorio" y un join más. |
| Punto geográfico | Columnas `geography` generadas (`GENERATED ALWAYS ... STORED`) a partir de las columnas decimales actuales. | Doble escritura de decimales y punto: riesgo de desincronía. |
| Auditoría transaccional | El repositorio del caso de uso escribe la auditoría dentro de su `$transaction`, recibiendo un valor `NuevaAuditoria` (o una fábrica de él). | Unit-of-work con `TransactionRunner` y repos ligados a la transacción: más piezas para un prototipo. |
| Sesión por cookie | Cookie HttpOnly con el mismo JWT y un token CSRF derivado por HMAC, sin estado. | Tabla de tokens CSRF: innecesaria. |
| Cookie parsing | Parser de 6 líneas, sin dependencia nueva. | `cookie-parser`. |
| Control de migraciones | Tabla `schema_migraciones`, scripts con guardia propia y un runner Node que invoca `psql`. | Runner basado en Prisma: no puede ejecutar scripts multi-sentencia. |

---

### 2. Modelo de datos

- **Entidades tocadas:** `usuarios`, `sesiones`, `publicaciones`, `terrenos`, `ubicaciones`, `fotografias`, `notificaciones`, `historial_precios`, `documentos_verificacion`, `favoritos` (lectura). Tablas nuevas: `schema_migraciones`, `auditoria`, `archivos`, `casas` no se crea.
- **Invariantes en el esquema:** ver 2.2.
- **Cambios de esquema:** 7 migraciones (001–007).

#### 2.1 Control de migraciones

**Carpeta y tabla**
- Carpeta `db/migraciones/`, con archivos `NNN_nombre.sql`.
- Tabla `schema_migraciones(version VARCHAR(10) PK, nombre VARCHAR(100) NOT NULL, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now(), aplicada_por TEXT NOT NULL DEFAULT current_user)`.
- La crea `001_inicial.sql` con `CREATE TABLE IF NOT EXISTS` en su primera sentencia.

**Estructura de cada archivo**
1. `BEGIN;`
2. Un bloque `DO $$` que lanza excepción si la versión ya está registrada.
3. Los cambios.
4. `INSERT INTO schema_migraciones ...;`
5. `COMMIT;`

Con esa estructura el mismo archivo funciona en pgAdmin (Query Tool) y en `psql -v ON_ERROR_STOP=1`. Reejecutarlo no daña nada: aborta en la guarda.

**Runner `scripts/db-migrar.mjs`** (Node, multiplataforma, sin dependencias nuevas), expuesto como `npm run db:migrar`:
- Lee `DATABASE_URL` y le quita `?schema=public`. `libpq` rechaza ese parámetro.
- Consulta las versiones aplicadas con `psql -Atc`. Si la tabla no existe, asume lista vacía.
- Ejecuta con `psql -v ON_ERROR_STOP=1 -f` solo las pendientes, en orden de nombre. Aplica cada versión por separado, sin depender de la máxima. Así 002–007 pueden fusionarse en cualquier orden.
- `--baseline 001` marca como aplicada la 001 en una BD creada con el `scriptdb.sql` antiguo.
- Regla del equipo: nunca editar una migración ya fusionada. Se corrige con una nueva.

**`db/scriptdb.sql`**
- Pasa a ser el esquema completo actualizado (equivale a aplicar 001–007).
- Termina con un `INSERT` de todas las versiones en `schema_migraciones`, para que `db:migrar` lo vea al día.
- Cada PR de esquema actualiza `scriptdb.sql` y `prisma/schema.prisma` en el mismo commit.
- Verificación opcional: `scripts/db-verificar-esquema.mjs` crea dos BD temporales (una con `scriptdb.sql`, otra con las migraciones) y compara `pg_dump -s`.

**`docker-compose.yml`**
- `image: postgis/postgis:16-3.4`.
- Volumen `./db/migraciones:/docker-entrypoint-initdb.d:ro`. Sustituye al montaje de `scriptdb.sql` (línea 16). El entrypoint ejecuta con `ON_ERROR_STOP` y en orden alfabético, así que 001…007 corren solos.
- Orden de ejecución: `001_` < `10_postgis.sh` en el orden alfabético, y `CREATE EXTENSION IF NOT EXISTS` en ambos lados lo hace inocuo.
- Con un volumen existente no se reejecuta: usar `npm run db:migrar` o `docker compose down -v`.

**Windows sin Docker**
- Instalar PostGIS con Stack Builder (Spatial Extensions).
- Verificar con `SELECT postgis_version();`.
- `002` ejecuta `CREATE EXTENSION IF NOT EXISTS postgis`, con el usuario `postgres`.

#### 2.2 Migraciones (cambios exactos)

| Ver. | Archivo | Contenido |
|---|---|---|
| 001 | `001_inicial.sql` | El esquema actual tal cual, más `schema_migraciones`. |
| 002 | `002_postgis_ubicaciones.sql` | Ver detalle abajo. |
| 003 | `003_tipos_inmueble.sql` | Ver detalle abajo. |
| 004 | `004_auditoria.sql` | Ver detalle abajo. |
| 005 | `005_moderacion_publicaciones.sql` | Ver detalle abajo. |
| 006 | `006_archivos.sql` | Ver detalle abajo. |
| 007 | `007_baja_precio_atomica.sql` | Ver detalle abajo. |

**002 – PostGIS**
- `CREATE EXTENSION IF NOT EXISTS postgis;`
- En `ubicaciones` se añaden dos columnas generadas:
  - `punto_publico geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitud_publica::float8, latitud_publica::float8), 4326)::geography) STORED`
  - `punto_exacto`, con la misma expresión sobre `longitud` y `latitud`.
- `ST_MakePoint` es estricta: si falta una de las dos coordenadas devuelve NULL. Un cálculo cuyo resultado es NULL equivale a "sin coordenadas".
- **Backfill:** automático. Al añadir una columna `STORED`, Postgres calcula el valor de las filas existentes. La migración lo comprueba al final con una consulta: `latitud_publica IS NOT NULL AND punto_publico IS NULL` debe dar 0, o lanza excepción y revierte.
- `CREATE INDEX idx_ubicaciones_punto_publico ON ubicaciones USING GIST (punto_publico);`
- Sin índice sobre `punto_exacto`: nadie lo consulta. Es un dato restringido.
- Las columnas decimales actuales siguen siendo la fuente de verdad. Prisma y los casos de uso no cambian al escribir.
- **Riesgo técnico:** la expresión debe ser IMMUTABLE. Los tres componentes (`ST_MakePoint`, `ST_SetSRID`, la conversión `geometry→geography`) están declarados IMMUTABLE en PostGIS 3. Se verifica en el PR.
- **Plan B si falla:** `BEFORE INSERT OR UPDATE` trigger con las mismas columnas no generadas.

**003 – Tipos de inmueble**
- `ALTER TABLE publicaciones ADD COLUMN tipo_propiedad VARCHAR(10) NOT NULL DEFAULT 'TERRENO' CHECK (tipo_propiedad IN ('CASA','LOTE','TERRENO'))`. Esto deja todas las publicaciones actuales como TERRENO. Después se hace `DROP DEFAULT`, para que la aplicación siempre lo fije explícito.
- Columnas de casa, todas nullable en `publicaciones`:
  - `habitaciones SMALLINT CHECK (habitaciones BETWEEN 1 AND 30)`
  - `banos SMALLINT CHECK (banos BETWEEN 1 AND 30)`
  - `area_construida_m2 NUMERIC(10,2) CHECK (area_construida_m2 > 0)`
  - `niveles SMALLINT CHECK (niveles BETWEEN 1 AND 10)`
  - `estacionamientos SMALLINT CHECK (estacionamientos BETWEEN 0 AND 20)`
- CHECK compuesto `ck_publicaciones_casa`:
  - Si `tipo_propiedad = 'CASA'`, entonces `habitaciones`, `banos` y `area_construida_m2` son NOT NULL.
  - Si `tipo_propiedad <> 'CASA'`, entonces los cinco campos de casa son NULL.
  - `niveles` y `estacionamientos` son opcionales cuando es CASA.
- Índice parcial `idx_publicaciones_activas_tipo ON publicaciones(tipo_propiedad, tipo_operacion) WHERE estado='ACTIVA'`.
- `terrenos` no cambia y sigue siendo 1:1 con la publicación. Para CASA, `area_m2` pasa a significar el área del terreno donde está la casa. Se documenta en un `COMMENT ON COLUMN`.
- El tipo de propiedad es **inmutable**: el DTO de edición no lo declara y, por `forbidNonWhitelisted`, devuelve 400.

**004 – Auditoría**
- Tabla `auditoria`:
  - `id_auditoria BIGINT GENERATED ALWAYS AS IDENTITY PK`
  - `id_actor BIGINT NOT NULL REFERENCES usuarios ON DELETE RESTRICT`
  - `accion VARCHAR(40) NOT NULL` con CHECK de lista cerrada: `USUARIO_BLOQUEADO`, `USUARIO_ACTIVADO`, `PUBLICACION_RECHAZADA`, `PUBLICACION_RESTAURADA`, `DOCUMENTO_APROBADO`, `DOCUMENTO_RECHAZADO`
  - `entidad VARCHAR(20) NOT NULL` con CHECK `IN ('USUARIO','PUBLICACION','DOCUMENTO')`
  - CHECK de coherencia: el prefijo de `accion` debe corresponder a `entidad`
  - `id_entidad BIGINT NOT NULL`
  - `detalle JSONB NOT NULL DEFAULT '{}'`
  - `fecha TIMESTAMPTZ NOT NULL DEFAULT now()`
- Índices: `(fecha DESC, id_auditoria DESC)`, `(entidad, id_entidad)` y `(id_actor, fecha DESC)`.
- **Append-only:**
  - Función `auditoria_inmutable()` que lanza excepción.
  - Trigger `BEFORE UPDATE OR DELETE` por fila.
  - Trigger `BEFORE TRUNCATE` por sentencia.
- Ampliar la lista de acciones exige una migración nueva con `ALTER TABLE ... DROP/ADD CONSTRAINT`.

**005 – Moderación**
- `ALTER TABLE publicaciones ADD COLUMN motivo_rechazo TEXT` con `CHECK (estado = 'RECHAZADA' OR motivo_rechazo IS NULL)`.
- No hay filas existentes que lo violen: ningún flujo actual produce RECHAZADA.
- Índice `idx_publicaciones_estado_fecha ON publicaciones(estado, fecha_publicacion DESC)` para el listado de administración.

**006 – Archivos**
- Tabla `archivos`:
  - `id_archivo BIGINT GENERATED ALWAYS AS IDENTITY PK`
  - `ruta VARCHAR(200) NOT NULL UNIQUE`
  - `id_usuario BIGINT NOT NULL REFERENCES usuarios ON DELETE CASCADE`
  - `categoria VARCHAR(10) NOT NULL CHECK (categoria IN ('IMAGEN','DOCUMENTO'))`
  - `fecha TIMESTAMPTZ NOT NULL DEFAULT now()`
- CHECK sobre `ruta`: regex del formato `^(imagenes|documentos)/<uuid>\.(jpg|png|webp|pdf)$` (el mismo del puerto `file-storage.port.ts:6-7`), más coherencia carpeta ↔ categoría.
- Índice `(fecha)` para el barrido de antigüedad.
- En `fotografias`:
  - `ruta VARCHAR(200) NULL REFERENCES archivos(ruta) ON DELETE RESTRICT` (la **clave del objeto**).
  - `externa BOOLEAN NOT NULL DEFAULT FALSE`.
  - CHECK `(externa AND ruta IS NULL) OR (NOT externa AND ruta IS NOT NULL)`.
  - Índice único parcial `(id_publicacion, ruta) WHERE ruta IS NOT NULL`.
  - La columna `url_imagen` se conserva como **URL de entrega**.
- En `documentos_verificacion`: FK `ruta_documento → archivos(ruta) ON DELETE RESTRICT`.
- **Backfill** (dentro de la misma transacción):
  1. Las fotos cuya `url_imagen` termina en `/uploads/imagenes/<uuid>.<ext>` obtienen su `ruta` con `substring(... from regex)`. Se inserta su fila en `archivos`, con propietaria la usuaria de la publicación (`publicaciones → vendedores.id_usuario`) y `ON CONFLICT (ruta) DO NOTHING`.
  2. Las demás se marcan `externa = TRUE`.
  3. Los documentos existentes se insertan como `DOCUMENTO` con propietaria `vendedores.id_usuario`.
  4. Las FK se crean `NOT VALID` y luego `VALIDATE CONSTRAINT`. Si un dato legado no cumple, la migración revierte y el error lo señala.
- **Decisión sobre fotos externas existentes:** se **conservan marcadas `externa = TRUE`**, sin borrarlas ni reescribirlas.
  - Justificación: borrar pierde datos del usuario y reescribir las URLs rompe imágenes que hoy se ven.
  - La nueva validación solo aplica a escrituras nuevas. Ninguna escritura posterior puede crear `externa = TRUE`.
  - Permite consultar y migrar lo legado después.
  - El CLI de limpieza ignora las externas, porque no tienen `ruta`.

**007 – Baja de precio atómica**
- `ALTER TABLE notificaciones ADD COLUMN id_historial BIGINT REFERENCES historial_precios(id_historial) ON DELETE SET NULL`.
- `ADD CONSTRAINT uq_notificaciones_usuario_historial UNIQUE (id_usuario, id_historial)`. Los NULL no chocan, así que las demás notificaciones no se ven afectadas.
- `ADD CONSTRAINT ck_baja_precio_historial CHECK (tipo <> 'BAJA_PRECIO' OR id_historial IS NOT NULL) NOT VALID`. Aplica solo a filas nuevas; las existentes se quedan sin vínculo, porque no se puede reconstruir con fiabilidad.

#### 2.3 `prisma/schema.prisma`

Solo `prisma generate`. Se actualiza la cabecera del archivo (cita la migración, no `scriptdb.sql`).

- **`Ubicacion`:** `puntoPublico Unsupported("geography(Point,4326)")? @map("punto_publico")` y `puntoExacto` igual. Al ser opcionales y generadas, no entran en `create` ni en `update`. No se declara `@@index(type: Gist)`: el índice vive en SQL.
- **`Publicacion`:**
  - `tipoPropiedad String @map("tipo_propiedad") @db.VarChar(10)` (sin `@default`).
  - `habitaciones Int? @db.SmallInt`, `banos Int? @db.SmallInt`, `areaConstruidaM2 Decimal? @db.Decimal(10,2)`, `niveles`, `estacionamientos`.
  - `motivoRechazo String? @map("motivo_rechazo")`.
- **`Archivo`** (modelo nuevo): `ruta @unique`, relaciones a `Usuario`, `Fotografia[]` y `DocumentoVerificacion[]`.
- **`Fotografia`:** `ruta String?`, `externa Boolean @default(false)` y relación opcional a `Archivo` por `ruta`.
- **`DocumentoVerificacion`:** relación a `Archivo` por `rutaDocumento`.
- **`Notificacion`:** `idHistorial BigInt?`, relación a `HistorialPrecio` con `onDelete: SetNull`, `@@unique([idUsuario, idHistorial])`.
- **`Auditoria`** (modelo nuevo): `detalle Json @default("{}")`, relación al actor.
- **Consultas con PostGIS:** solo `$queryRaw` parametrizado con `Prisma.sql`, nunca interpolando texto.

#### 2.4 Consultas que implica el diseño

| Consulta | Ruta de acceso esperada |
|---|---|
| Candidatas por radio: `ST_DWithin(u.punto_publico, centro, metros)` sobre `ubicaciones`, unido a `terrenos` | Índice GiST `idx_ubicaciones_punto_publico`. Con cientos de filas el planificador puede preferir seq scan; es correcto. |
| Listado con el resto de filtros: `id IN (candidatas)` más filtros Prisma | PK de `publicaciones` más `idx_publicaciones_activas_tipo`. |
| Cierre de sesiones al bloquear | `idx_sesiones_usuario_activa (id_usuario, activa)`. |
| Auditoría paginada con filtros | `(fecha DESC, id_auditoria DESC)`, `(entidad, id_entidad)` o `(id_actor, fecha DESC)`. |
| Barrido de archivos viejos sin referencia, por lotes por `id_archivo` | `archivos(fecha)` más `NOT EXISTS` sobre `fotografias(ruta)` y `documentos_verificacion(ruta_documento)`. Falta un índice en esta última columna: se añade `idx_documentos_ruta` en 006. |
| Destinatarios de la baja de precio | `favoritos` por `id_publicacion` (UNIQUE ya cubre `(id_cliente, id_publicacion)`; añadir `idx_favoritos_publicacion` en 007). |

---

### 3. Failure modes

| Falla | Detecta | Superficie | Recupera |
|---|---|---|---|
| Parámetros de radio incompletos o fuera de rango (A) | DTO (`ValidateIf` para el todo-o-nada, `Min`/`Max`) | 400 `VALIDATION_ERROR` | El cliente corrige. |
| Filtros de casa (`habitacionesMin`, `banosMin`) con `tipoPropiedad` ≠ CASA (A) | Caso de uso | 422 | El cliente corrige. |
| `orden=DISTANCIA` sin centro (A) | DTO | 400 | El cliente corrige. |
| Teléfono inválido en perfil (B) | Dominio | 422 | El cliente corrige. |
| Objetivo de bloqueo inexistente (C) | Repo devuelve null | 404 | Ninguna. |
| Admin se bloquea a sí mismo o a otro admin (C) | Regla de dominio | 403 | Ninguna. Se registra WARN. |
| Bloqueo sin motivo (C) | Dominio | 422 | El cliente añade el motivo. |
| Mismo estado repetido (C) | Estado leído con bloqueo de fila | 200 con `huboCambio=false`, sin auditoría ni sesiones tocadas | Ninguna. Es idempotente. |
| Transición de moderación inválida o rechazo sin motivo (D) | Dominio | 422 | El cliente corrige. |
| Moderar una publicación que cambió de estado entre la lectura y el UPDATE (D) | UPDATE condicional afecta 0 filas | 409 | El admin recarga y reintenta. |
| Fallo al insertar auditoría (C, D, revisión de documentos) | Excepción dentro de la transacción | 500 (sin detalle al cliente) | Se revierte todo. El admin reintenta. |
| URL de imagen que no es del sistema, o que no está registrada como IMAGEN (F) | Servicio de resolución de imágenes | 422 | Subir con `POST /archivos/imagenes`. |
| Imagen de otro usuario (F) | Servicio de resolución | 403 | Ninguna. |
| El archivo se borró entre validar e insertar (FK violada, P2003) (F) | Repo traduce el error | 422 "la imagen ya no está disponible, súbela de nuevo" | Resubir. |
| Se escribe el archivo en disco pero falla el INSERT en `archivos` (F) | Excepción en `SubirArchivo` | 500 | Borrado compensatorio del fichero (mejor esfuerzo). Si también falla, el barrido de disco del CLI lo recoge. |
| CLI: error al borrar un fichero | Captura por archivo | Se cuenta en `errores`, exit code 2 al final | Se reintenta en la siguiente ejecución. |
| CLI: BD caída | Excepción en la conexión | Exit code 1 | Reejecutar. |
| Baja de precio: fallo al insertar notificaciones (G) | Excepción dentro de la transacción | 500 | Se revierte precio, historial y avisos. El vendedor reintenta. |
| Dos cambios de precio simultáneos (G) | `FOR UPDATE` serializa | El segundo ve el precio ya cambiado y, si es igual, 422 | Ninguna. |
| CSRF ausente o inválido con cookie (H) | `CsrfGuard` | 403 `FORBIDDEN` "token CSRF inválido" | El frontend llama a `GET /auth/csrf` y reintenta. |
| `Origin` ajeno con cookie en método no seguro (H) | `CsrfGuard` | 403 | Ninguna. |
| Cookie expirada o sesión revocada (H) | `ValidarSesion` | 401 | Login. |
| Migración pendiente o PostGIS ausente | `GET /health` | 503 con mensaje | Aplicar `npm run db:migrar` o instalar PostGIS. |

---

### 4. Authorization

- **Principal:** descrito por endpoint en la matriz. Autenticación vía Bearer (Swagger, script) o cookie HttpOnly (frontend).
- **Enforcement:** guards de aplicación (`JwtAuthGuard` + `RolesGuard`, ya existentes) más reglas de propiedad y de objetivo en el dominio. No hay RLS: se mantiene el estilo actual.

| Endpoint | Quién | Alcance |
|---|---|---|
| `GET /publicaciones` | Público (Optional guard) | Solo ACTIVA de vendedores con cuenta ACTIVA. Nunca punto exacto. |
| `PATCH /auth/me` | Autenticado | Solo su propia fila (el id sale de `AuthUser`, no del cuerpo). |
| `GET /auth/csrf` | Autenticado (cookie o Bearer) | Su propia sesión. |
| `GET /admin/usuarios`, `PATCH /admin/usuarios/:id/estado` | ADMIN | Cualquier usuario no ADMIN para bloquear. Nunca a sí mismo. |
| `GET /admin/publicaciones`, `PATCH /admin/publicaciones/:id/moderacion` | ADMIN | Cualquier publicación. |
| `GET /admin/auditoria` | ADMIN | Lectura. No hay endpoint de escritura. |
| `POST /archivos/imagenes` | VENDEDOR, ADMIN (sin cambio) | Registra la fila con `id_usuario = actor`. |
| `POST /archivos/documentos` | VENDEDOR (sin cambio) | Idem. |
| `POST /publicaciones`, `POST /publicaciones/:id/fotografias` | VENDEDOR dueño | Solo imágenes IMAGEN propias. |
| `POST /vendedores/me/documentos` | VENDEDOR | Solo documentos DOCUMENTO propios. |
| `PATCH /admin/documentos/:id/revision` | ADMIN (sin cambio) | Ahora además se audita. |

**Asignación de ADMIN:** solo por el seed (`prisma/seed.ts`). No hay endpoint para otorgar el rol, y `PATCH /admin/usuarios/:id/estado` no toca `rol`.

**Exposición de datos**
- El listado público devuelve `latitud` y `longitud` públicas, `distanciaKm` calculada contra el punto público, y nada de `*Exacta`.
- `motivoRechazo` solo aparece en la vista de detalle privilegiada (dueño o admin) y en el listado de administración.
- `GET /admin/usuarios` expone `correo` y `telefono` solo a ADMIN. Nunca `passwordHash`.
- `auditoria.detalle` guarda ids, estados y motivo, sin datos personales adicionales.
- El `detalle` público de una publicación de un usuario bloqueado devuelve 404 para quien no es dueño ni admin.

**Seguridad de sesión por cookie (H)**

| Aspecto | Diseño |
|---|---|
| Cookie | Nombre `inmobisv_sesion`, valor = el mismo JWT. `HttpOnly`, `Path=/api`, `Max-Age = JWT_EXPIRES_IN`, sin `Domain`. `Secure` si `NODE_ENV=production` o `COOKIE_SECURE=true`. `SameSite` por `COOKIE_SAMESITE` (`lax` por defecto). |
| `SameSite=None` | Exige `Secure`. `validateEnv` falla en el arranque si se pide `none` sin Secure. |
| Convivencia con Bearer | Si la petición trae `Authorization: Bearer`, solo se considera esa credencial, sin recurrir a la cookie. Si no, se usa la cookie. |
| CSRF | `CsrfGuard` global (`APP_GUARD`, registrado antes de los guards de ruta, `app.module.ts:34-37`). Métodos GET/HEAD/OPTIONS pasan. Si hay Bearer, pasa: un navegador no adjunta ese header en un ataque cross-site. Si no hay cookie de sesión, pasa (login y registro, que además exigen `application/json`). Si hay cookie, exige `X-CSRF-Token` válido. |
| Token CSRF | `HMAC-SHA256(clave derivada de JWT_SECRET, valor de la cookie)`. Sin estado: no hay tabla ni cookie extra. Se devuelve como `csrfToken` en login, registro y refresh, y por `GET /auth/csrf`. Lo guarda el frontend en memoria. Se compara con `timingSafeEqual`. |
| Defensa en profundidad | En métodos no seguros con cookie, si llega `Origin` y no está en `CORS_ORIGINS`, 403. Un `Origin` ausente (curl) no basta para pasar: el token sigue siendo obligatorio. |
| Logout | Finaliza la sesión (como hoy) y borra la cookie con los mismos atributos (`Path`, `SameSite`, `Secure`). |
| Refresh | Emite token nuevo, fija la cookie nueva y devuelve el `csrfToken` nuevo. |
| CORS | `credentials: true`, orígenes explícitos. `validateEnv` rechaza `*` en `CORS_ORIGINS`. `allowedHeaders` suma `X-CSRF-Token` y `X-Request-Id`. `exposedHeaders: ['X-Request-Id']` (`main.ts:27-32`). |
| El token en el cuerpo | Sigue devolviéndose (lo usan Swagger y el script). Un frontend que lo guarde en JS pierde la ventaja de HttpOnly. Recomendación en la documentación: ignorarlo y confiar en la cookie. |

---

### 5. Idempotence and concurrency

- **Replay safety:**
  - C es idempotente: repetir el mismo estado devuelve 200 sin auditar de nuevo.
  - D no es idempotente por diseño: repetir RECHAZAR sobre una RECHAZADA da 422.
  - PATCH `/auth/me` es idempotente.
  - Las subidas crean un archivo nuevo en cada llamada, y las huérfanas las limpia el CLI.
  - El CLI se puede repetir sin efectos.
  - G no duplica avisos gracias a `UNIQUE(id_usuario, id_historial)` más `createMany({ skipDuplicates: true })`.
- **Concurrency model:**

| Operación | Mecanismo |
|---|---|
| C: bloquear/activar | Fila de `usuarios` con `SELECT ... FOR UPDATE` dentro de la transacción. La decisión de "mismo estado" se toma sobre el valor bloqueado. |
| D: moderar | `updateMany WHERE id=? AND estado IN (...)`. Si afecta 0 filas, se relee: inexistente → 404, existente → 409. |
| Vendedor pausa/reactiva vs. admin | `cambiarEstado(id, desde, hacia): Promise<boolean>` condicional. Un false se traduce en `ConflictError` 409. |
| Revisión de documentos | `updateMany WHERE estado_revision='PENDIENTE'`; 0 filas → 409. |
| G: precio | Se mantiene el `FOR UPDATE` actual (`prisma-publicacion.repository.ts:149-150`). El `estado` se lee dentro de ese bloqueo para decidir si hay aviso. |
| F: limpieza | `DELETE ... RETURNING` por archivo con `NOT EXISTS` de referencias. Dos ejecuciones simultáneas no borran dos veces: el fichero se elimina de forma tolerante a ENOENT. |
| F: referencia concurrente | La FK `RESTRICT` impide borrar una fila en uso. Si el CLI borra justo antes de que alguien la referencie, el INSERT falla y se traduce a 422. |
| A: lectura | Solo lectura. Sin concurrencia relevante. |

- **Idempotency key contract:** no se requiere clave. Las mutaciones tienen identidad natural (usuario, publicación, historial) o son idempotentes por estado.
- **Cross-store writes:** una sola excepción, en F: disco más BD.
  - Subida: primero se escribe el fichero y después la fila. Si falla la fila, se borra el fichero (compensación). Si también falla, el barrido de disco lo recoge.
  - Limpieza: primero se borra la fila y después el fichero. Así el peor caso es un fichero huérfano (recuperable por el barrido), nunca una fila apuntando a un fichero ausente.
  - Sin outbox: no hay un destino externo con entrega asíncrona.

---

### 6. Observability

- **Logs** (JSON estructurado por línea, NestJS `Logger`):
  - Campos comunes: `requestId`, `idUsuario`, `evento`.
  - **Middleware `X-Request-Id`** (`src/shared/infrastructure/http/request-id.middleware.ts`). Reutiliza el header entrante si cumple `^[A-Za-z0-9._-]{8,64}$`; si no, genera un UUID. Lo guarda en `req` y lo devuelve en la respuesta.
  - `AllExceptionsFilter` (`all-exceptions.filter.ts:61-66`) incluye `requestId` en el log de errores y en el cuerpo de la respuesta.
  - WARN en bloqueos, activaciones y rechazos, con `actor`, `objetivo`, `motivo` y `huboCambio`. WARN también en rechazos CSRF.
  - Los casos de uso no conocen el `requestId`: la correlación con una acción administrativa se hace por la fila de `auditoria`.
  - No se registran cuerpos de petición, tokens ni cookies.
- **Métricas** (el proyecto no tiene backend de métricas; se derivan de un log de acceso de una línea por petición, con un interceptor pequeño en el PR de request-id):
  - Rate: peticiones por ruta.
  - Errors: respuestas 4xx/5xx por ruta, y 403 por CSRF.
  - Duration: milisegundos por petición.
  - Para el CLI: `revisados`, `borrados`, `conservados`, `errores`, y si fue simulación.
- **Healthcheck** (`health.controller.ts:15-19`):
  - Mantiene `SELECT 1`.
  - Añade `SELECT 1 FROM pg_extension WHERE extname='postgis'`. Si no existe, 503 con el mensaje "PostGIS no está instalado".
  - Comprueba que todas las versiones de una constante `MIGRACIONES_REQUERIDAS` estén en `schema_migraciones`. Cada PR de esquema añade la suya. Si falta alguna, 503 con las versiones pendientes. Así un integrante que olvidó migrar se entera de inmediato.
  - Devuelve además `{ postgis: true, esquema: [...versiones] }`.
- **Trace propagation:** entrante, el header `X-Request-Id`. Saliente, la llamada a Overpass no lo necesita. El CLI genera un `requestId` propio por ejecución.

---

### Diseño por módulo (archivos, puertos, casos de uso, errores)

#### Nuevo `src/shared/` (transversal)

| Archivo | Contenido |
|---|---|
| `shared/domain/auditoria.ts` | Tipos `AccionAuditoria`, `EntidadAuditoria`, `NuevaAuditoria {idActor, accion, entidad, idEntidad, detalle}` y el token `AUDITORIA_REPOSITORY` con `listar(filtro, paginacion)` (solo lectura). |
| `shared/infrastructure/prisma/auditoria-writer.ts` | `escribirAuditoria(tx, entrada)`. Lo usan todos los repositorios dentro de su `$transaction`. |
| `shared/infrastructure/http/request-id.middleware.ts` | Middleware descrito arriba. Se registra en `main.ts` junto a helmet (`main.ts:21`). |
| `shared/infrastructure/security/session-cookie.ts` | `NOMBRE_COOKIE`, `leerCookie(header, nombre)`, `opcionesCookie(config)`. |
| `shared/infrastructure/security/csrf.service.ts` y `csrf.guard.ts` | HMAC y guard. |
| `shared/infrastructure/security/jwt-auth.guard.ts` (modificar) | `extraerBearer` (`:9-14`) pasa a `extraerCredencial(request)`: Bearer primero, cookie si no hay. Se aplica a `JwtAuthGuard` y a `OptionalJwtAuthGuard`. |
| `shared/domain/file-storage.port.ts` (modificar) | Se añaden `eliminar(ruta)`, `listar(carpeta): AsyncIterable<{ruta, modificadoEn}>` y `rutaDesdeUrl(url): string \| null`. |
| `config/env.validation.ts` (modificar) | `COOKIE_SAMESITE`, `COOKIE_SECURE`, rechazo de `*` en `CORS_ORIGINS`, y `none` sin Secure. |
| `main.ts` (modificar) | CORS con `credentials`, nuevos headers y request-id. |
| `.env.example` | Variables nuevas documentadas. |

#### A. Búsqueda por cercanía (módulo `publicaciones`)

**Dominio**
- `publicacion.ts`: `FiltroPublicaciones` suma `centro?: { latitud; longitud; radioKm }`, `tipoPropiedad?`, `habitacionesMin?`, `banosMin?`, y `OrdenPublicaciones` suma `'DISTANCIA'`.
- `PublicacionResumen` suma `tipoPropiedad`, `latitud`, `longitud` (públicas, nullable), `distanciaKm | null`, `habitaciones | null`, `banos | null` y `areaConstruidaM2 | null`.
- `publicacion.rules.ts`: nueva `validarFiltroCasa(filtro)`, que lanza `BusinessRuleError` si hay `habitacionesMin` o `banosMin` con `tipoPropiedad` distinto de CASA.

**Aplicación**
- `listar-publicaciones.use-case.ts`: `validarRangos` (`:44-55`) incorpora la regla anterior. La firma de `execute` no cambia.

**Presentación**
- `FiltroPublicacionesDto` (`publicaciones.dto.ts:33-61`) suma:
  - `lat` (−90…90), `lng` (−180…180), `radioKm` (0.1…50), con `@Type(() => Number)`.
  - `@ValidateIf` para exigir los tres juntos, y también `lat`/`lng` cuando `orden=DISTANCIA`.
  - `tipoPropiedad` (`IsIn`), `habitacionesMin` (entero 1…30), `banosMin` (entero 1…30).
  - `'DISTANCIA'` en `ORDENES`.
- El controlador (`:80-83`) arma `centro` a partir de `lat`, `lng` y `radioKm`.

**Infraestructura** (`prisma-publicacion.repository.ts`)
- `buscarActivas`, cuando hay centro:
  1. `$queryRaw` con `Prisma.sql`: devuelve `(idPublicacion, distM)` de `ubicaciones u JOIN terrenos t` con `ST_DWithin(u.punto_publico, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography, ${radioKm * 1000}::float8)`, tope `LIMIT 2000`.
  2. El resto de filtros sigue en `construirWhere` (`:245-272`) con `id: { in: candidatas }`. No se duplica la lógica de filtros en SQL.
  3. Orden distinto de DISTANCIA: Prisma pagina como hoy (`ORDEN`, `:30-36`).
  4. Orden DISTANCIA: se traen las filas sin paginar, se ordenan en memoria por `distM` (desempate por id) y se corta la página. `total` = filas filtradas. Es válido para cientos de publicaciones.
- `construirWhere` suma `vendedor: { usuario: { estadoCuenta: 'ACTIVA' } }`, para que las publicaciones de usuarios BLOQUEADOS (o INACTIVOS) no aparezcan.
- `publicacion.mapper.ts`: `resumenInclude` ya trae `ubicacion` (`:17-20`). `aResumen` (`:84-102`) mapea `latitud/longitud` desde `latitudPublica/longitudPublica`, y los campos de casa.
- **Misma regla de visibilidad para usuarios bloqueados** en:
  - `cargarPublicacionVisible` (`acceso.ts:13-26`): 404 si el vendedor no está ACTIVA y quien consulta no es dueño ni admin. Para esto `Publicacion.vendedor` suma `estadoCuenta`.
  - `comparaciones`: `disponible` exige también vendedor ACTIVA (`prisma-comparacion.repository.ts:31`).
- Alternativa descartada para el bloqueo: pausar las publicaciones del bloqueado dentro de la transacción de C. Es más simple, pero cambia datos del vendedor y pierde el estado previo.

#### B. Editar perfil (módulo `auth`)

- **Dominio** (`auth/domain/`): función `validarCambioPerfil(usuario, cambios)`:
  - Normaliza el teléfono (`normalizarTelefono`) y lo valida (`esTelefonoValido`) → 422.
  - Un VENDEDOR no puede dejar el teléfono vacío → 422.
  - Si el teléfono cambia, `telefonoVerificado` pasa a `false`.
- **Puerto:** `UsuarioRepository.actualizarPerfil(idUsuario, { nombreCompleto?, telefono?, telefonoVerificado? }): Promise<Usuario>` (`usuario.repository.ts:17-26`).
- **Caso de uso:** `application/use-cases/actualizar-perfil.use-case.ts`, `execute({ user, nombreCompleto?, telefono? })`. Errores: 404/401 si el usuario ya no existe, 422 por reglas.
- **DTO** (`auth.dto.ts`): `ActualizarPerfilDto { nombreCompleto?: 2..150 trim; telefono?: string \| null }` con un validador personalizado "al menos un campo" (400). `correo`, `rol` y `estado` no están declarados, así que `forbidNonWhitelisted` devuelve 400.
- **Controlador:** `PATCH /auth/me` bajo `JwtAuthGuard`.
- No audita: no es una acción administrativa.

#### C. Administración de usuarios (módulo nuevo `administracion`)

Estructura: `src/modules/administracion/{domain,application,infrastructure,presentation}` y `administracion.module.ts`. Se importa en `AppModule`.

**Dominio**
- `usuario-admin.ts`: `UsuarioAdminResumen` (id, nombre, correo, telefono, rol, estadoCuenta, fechaRegistro, idVendedor, estadoVerificacion), `FiltroUsuariosAdmin { rol?, estado?, q? }`.
- `usuario-admin.rules.ts`: `decidirCambioEstado({ actor, objetivo, nuevoEstado, motivo })`:
  - Objetivo es el propio actor y se pide BLOQUEADA → `ForbiddenError`.
  - Objetivo ADMIN y se pide BLOQUEADA → `ForbiddenError`.
  - BLOQUEADA sin motivo (trim, 1…500) → `BusinessRuleError`.
  - Orden de evaluación: 404 → 403 → 422 → no-op. Un reintento idéntico da siempre la misma respuesta.
- `usuario-admin.repository.ts` (token `USUARIO_ADMIN_REPOSITORY`):
  - `listar(filtro, paginacion): Promise<{items, total}>`
  - `buscarPorId(id): Promise<UsuarioAdminResumen | null>`
  - `cambiarEstado(idObjetivo, nuevoEstado, construirAuditoria: (estadoAnterior) => NuevaAuditoria): Promise<{ huboCambio, estadoAnterior, sesionesCerradas } | null>`. Sigue el patrón de resolvers ya usado en `prisma-documento.repository.ts:47-52`.

**Aplicación** (una clase por caso)
- `listar-usuarios-admin.use-case.ts`
- `cambiar-estado-usuario.use-case.ts`: lee el objetivo, aplica `decidirCambioEstado`, llama al repo, y emite el `Logger.warn` con `actor`, `objetivo`, `motivo` y `huboCambio`.

**Infraestructura** (`prisma-usuario-admin.repository.ts`), todo en una `$transaction`:
1. `SELECT ... FROM usuarios WHERE id_usuario = ? FOR UPDATE`.
2. Si el estado ya es el pedido: devuelve `huboCambio=false` sin escribir nada.
3. Si no: actualiza `estado_cuenta` y `fecha_actualizacion`.
4. Si el nuevo estado es BLOQUEADA: `updateMany` sobre `sesiones` (`activa=true`) con `activa=false, fecha_finalizacion=now()`.
5. Inserta la auditoría vía `escribirAuditoria` con `accion` `USUARIO_BLOQUEADO` o `USUARIO_ACTIVADO`, y `detalle { motivo, estadoAnterior, estadoNuevo, sesionesCerradas }`.

**Errores:** 404 (usuario), 403 (autobloqueo o bloqueo de admin), 422 (motivo), 400 (DTO). Idempotente → 200.

#### D. Moderación (mismo módulo `administracion`)

**Dominio**
- `moderacion.rules.ts`: `calcularModeracion(accion, estadoActual, motivo)`:
  - `RECHAZAR`: solo desde ACTIVA o PAUSADA, con motivo obligatorio (trim, 1…500) → destino RECHAZADA. Otro estado, incluidas PENDIENTE, VENDIDA y RENTADA → 422.
  - `RESTAURAR`: solo desde RECHAZADA → destino PAUSADA. El vendedor decide cuándo reactivar, y `REACTIVAR` ya exige foto (`publicacion.rules.ts:36-38`).
- `publicacion-admin.repository.ts` (token `PUBLICACION_ADMIN_REPOSITORY`):
  - `listar(filtro, paginacion)`: cualquier estado.
  - `buscarEstado(id)`.
  - `moderar(id, { desde: EstadoPublicacion[], hacia, motivo, aviso, construirAuditoria }): Promise<'OK' | 'CONFLICTO' | 'NO_EXISTE'>`.

**Aplicación**
- `listar-publicaciones-admin.use-case.ts`
- `moderar-publicacion.use-case.ts`: carga el estado, aplica `calcularModeracion`, arma el texto del aviso y llama al repo. Un `CONFLICTO` se traduce en `ConflictError` 409 y un `NO_EXISTE` en 404. Emite `Logger.warn`.

**Infraestructura** (`prisma-publicacion-admin.repository.ts`), en una `$transaction`:
1. `updateMany WHERE id = ? AND estado IN (...)` fijando `estado`, `motivo_rechazo` (con el motivo al rechazar, NULL al restaurar) y `fecha_actualizacion`.
2. 0 filas → relee: no existe → `NO_EXISTE`; existe → `CONFLICTO`.
3. `notificacion.create` para el usuario del vendedor, con tipo `PUBLICACION_RECHAZADA` o `PUBLICACION_RESTAURADA` y el motivo en el mensaje.
4. `escribirAuditoria`: acciones `PUBLICACION_RECHAZADA` o `PUBLICACION_RESTAURADA`, con `detalle { motivo, estadoAnterior, estadoNuevo }`.

**Cambios en el módulo `publicaciones`**
- `PublicacionRepository.cambiarEstado(id, desde, hacia): Promise<boolean>` (hoy es `(id, estado): Promise<void>`, `publicacion.repository.ts:37`). `CambiarEstadoUseCase` lo usa con el estado leído y lanza `ConflictError` si devuelve false (`cambiar-estado.use-case.ts:26`).
- `construirVistaDetalle` añade `motivoRechazo` solo cuando `privilegiado` (`vistas.ts:29-35`).

#### E. Auditoría

- `shared/domain/auditoria.ts` (arriba) y `administracion/application/listar-auditoria.use-case.ts`.
- `administracion/infrastructure/prisma-auditoria.repository.ts`: solo lectura, con join al actor para el nombre.
- **Filtros:** `accion`, `entidad`, `idEntidad`, `idActor`, `desde`, `hasta`. Fechas ISO inválidas → 400; `desde > hasta` → 422.
- **Revisión de documentos** (módulo `verificacion`):
  - `DocumentoRepository.revisarDocumento` suma el parámetro `construirAuditoria`.
  - `RevisarDocumentoUseCase` recibe el actor desde el controlador (`verificacion.controller.ts:121-124`, agregando `@CurrentUser()`).
  - Ya lleva el `updateMany` condicional (hallazgo 4), con 0 filas → 409.
  - Acciones `DOCUMENTO_APROBADO` y `DOCUMENTO_RECHAZADO`, `detalle { estado, observaciones, idVendedor, estadoVerificacion }`.

#### F. Archivos robustos

**Dominio** (`archivos/domain/`)
- `archivo.repository.ts` (token `ARCHIVO_REPOSITORY`):
  - `registrar({ ruta, idUsuario, categoria })`
  - `buscarPorRutas(rutas): Promise<{ ruta, idUsuario, categoria }[]>`
  - `listarAntiguos(corte, despuesDeId, limite): Promise<{ idArchivo, ruta, sinReferencia }[]>`
  - `eliminarSiSinReferencia(ruta, corte): Promise<boolean>`
  - `existePorRuta(ruta): Promise<boolean>`
- `clasificar-referencias.ts` (función pura): dado el usuario, las URLs convertidas a rutas y las filas encontradas, devuelve OK o el error correspondiente. Hay un tipo de resultado por caso, y el servicio lo traduce a 422/403.

**Aplicación**
- `application/resolver-imagenes.service.ts` (`ResolverImagenesService`): `resolver(user, urls[]): Promise<{ urlImagen, ruta }[]>`.
  - URL que `FileStorage.rutaDesdeUrl` no reconoce → 422.
  - Ruta sin fila `archivos`, o con categoría ≠ IMAGEN → 422.
  - Fila de otro `id_usuario` → 403.
  - Rutas repetidas en la misma petición → 422.
- `SubirArchivoUseCase` (`subir-archivo.use-case.ts:19-37`): recibe `idUsuario`, y tras `storage.guardar` llama a `repo.registrar`. Si el registro falla, compensa con `storage.eliminar` (mejor esfuerzo) y relanza el error.
- `application/limpiar-archivos.use-case.ts`: `execute({ simulacion, ahora, antiguedadHoras = 24 })`, devuelve `{ revisados, borrados, conservados, errores }`.
  1. Corte = `ahora − 24 h`.
  2. Recorre `archivos` con `fecha < corte` en lotes de 500 por `id_archivo`. Si no tiene referencias y no es simulación: `eliminarSiSinReferencia` y luego `storage.eliminar`. Si tiene referencias o la fila ya no existe: `conservados`.
  3. Recorre el disco (`storage.listar`) para `imagenes` y `documentos`. Un fichero con `modificadoEn < corte` y sin fila en `archivos` se borra. Cubre subidas interrumpidas y filas borradas por cascada.
  4. Por archivo, captura el error y lo cuenta en `errores`.
- Los usos de las imágenes en `CrearPublicacionUseCase` (`crear-publicacion.use-case.ts:36-65`) y `AgregarFotografiasUseCase` (`gestionar-fotografias.use-cases.ts:13-22`) llaman al servicio antes de `repo.crear` y `repo.agregarFotografias`. Reciben `NuevaFotografia` con `ruta` ya resuelta.
- `EnviarDocumentoUseCase` (`verificacion.use-cases.ts:26-33`) usa el mismo servicio con categoría DOCUMENTO.

**Infraestructura**
- `prisma-archivo.repository.ts`.
- `LocalFileStorage` (`local-file-storage.ts`): implementa `eliminar` con la misma validación anti path-traversal que `leer` (`:33-44`), `listar` con `readdir` + `stat`, y `rutaDesdeUrl` (compara el prefijo `${baseUrl}/uploads/`, `:46-48`, y valida con `esRutaArchivoValida`).
- `prisma-publicacion.repository.ts`: `crear` (`:54-59`) y `agregarFotografias` (`:197-205`) guardan `ruta`. La FK violada (P2003) se traduce a `BusinessRuleError`.
- `ArchivosModule` exporta `ARCHIVO_REPOSITORY` además de `FILE_STORAGE`. `PublicacionesModule` y `VerificacionModule` importan `ArchivosModule`.

**CLI** `src/cli/limpiar-archivos.ts`
- Crea el contexto de aplicación con `NestFactory.createApplicationContext` sobre un `CliModule` mínimo (`ConfigModule`, `PrismaModule`, `ArchivosModule`, `LimpiarArchivosUseCase`).
- Script en `package.json`: `"archivos:limpiar": "ts-node --transpile-only src/cli/limpiar-archivos.ts"`.
- Uso: `npm run archivos:limpiar -- --simulacion`.
- Salida: una línea `revisados=N borrados=M conservados=K errores=E simulacion=true|false`.
- Códigos de salida: 0 correcto, 1 error inesperado, 2 si hubo `errores > 0`.
- En simulación no borra nada y cuenta como `borrados` los que se borrarían.

#### G. Baja de precio atómica

**Dominio**
- Se elimina el puerto `BAJA_PRECIO_NOTIFIER` (`baja-precio-notifier.port.ts`) y su adaptador (`prisma-baja-precio-notifier.ts`), y se quita el provider de `publicaciones.module.ts:41`.
- Nuevo `publicaciones/domain/baja-precio.ts`: `construirAvisoBajaPrecio({ titulo, precioAnterior, precioNuevo }): { titulo, mensaje }` (función pura, texto "inmueble" en lugar de "terreno").
- `PublicacionRepository.registrarCambioPrecio(idPublicacion, nuevoPrecio, avisarBaja: { excluirIdUsuario; construir: (precioAnterior) => { titulo; mensaje } } | null)` devuelve `{ precioAnterior, huboCambio, avisosCreados }`.

**Aplicación** (`actualizar-precio.use-case.ts`)
- Elimina el bloque try/catch posterior (`:51-66`) y la dependencia del notifier (`:24`).
- Pasa la fábrica al repositorio. El repositorio decide dentro del bloqueo si hay baja y si la publicación está ACTIVA.
- `ResultadoActualizacionPrecio.clientesNotificados` sigue existiendo y toma el valor `avisosCreados`.

**Infraestructura** (`registrarCambioPrecio`, `:143-168`), en la misma `$transaction`:
1. `FOR UPDATE` (se lee también `estado`).
2. Si el precio no cambia: `huboCambio=false`.
3. `UPDATE` del precio y `INSERT` en `historial_precios` con `RETURNING id_historial`.
4. Si hay baja y `estado='ACTIVA'`: destinatarios = `favoritos → clientes → usuarios` de esa publicación, excluyendo al vendedor y a usuarios no ACTIVA. Se insertan con `notificacion.createMany({ skipDuplicates: true })`, con `idHistorial` y `tipo='BAJA_PRECIO'`.
5. Cualquier excepción revierte precio, historial y avisos.

**Tests existentes:** `NotifierFalso` (`test/casos-de-uso.spec.ts:350-358`) y su uso en el describe de P11 (`:360`) se reemplazan por un fake de repositorio que registra `avisarBaja`.

#### H. Sesión por cookie (módulo `auth`)

- `auth.controller.ts`: los handlers de registro, login y refresh reciben `@Res({ passthrough: true })`. Fijan la cookie con `opcionesCookie` y devuelven `{ usuario, token, tipoToken, expiraEn, csrfToken }`. `respuestaSesion` (`:17-19`) suma `csrfToken`. Logout (`:54-60`) borra la cookie. Nuevo `GET /auth/csrf`.
- `CsrfService` y `CsrfGuard` descritos en la sección 4. El guard se registra como `APP_GUARD` en `AppModule`.
- Casos de uso de auth: sin cambios, salvo el nuevo `ActualizarPerfilUseCase` (B). La cookie es una responsabilidad de presentación.
- Swagger sigue con `addBearerAuth` (`main.ts:60`).

#### Comparación P12 con tipos de inmueble

- **Propuesta confirmada:** solo se comparan publicaciones con el **mismo tipo de operación Y el mismo `tipoPropiedad`**.
- **Justificación:**
  - Precio por m² y área solo son comparables entre inmuebles del mismo tipo: en una CASA el precio incluye construcción y el área de terreno engaña.
  - Cada tipo necesita un resumen distinto: CASA suma habitaciones, baños y área construida.
  - Regla simple y predecible para la interfaz.
- **LOTE vs. TERRENO:** se podrían comparar entre sí, pero se mantiene estricto. Una regla uniforme es más fácil de explicar. Queda en preguntas abiertas.
- **Cambios:**
  - `comparacion.ts`: `TerrenoComparable` suma `tipoPropiedad` y los campos de casa. Nueva `validarMismoTipoPropiedad` junto a `validarMismaOperacion` (`:51-55`). El mensaje de 422 incluye `details { tiposPropiedad }`.
  - `construirResumen` (`:58-68`) devuelve para CASA además `masHabitaciones` y `mayorAreaConstruida`.
  - `CrearComparacionUseCase` (`comparaciones.use-cases.ts:46`) llama a la nueva validación después de la de operación.
  - `prisma-comparacion.repository.ts` mapea los campos nuevos.

#### Vistas

- Resumen del listado: ver A.
- Detalle (`vistas.ts`): suma `tipoPropiedad` y `casa: { habitaciones, banos, areaConstruidaM2, niveles, estacionamientos } | null`. La clave `terreno` se mantiene, porque describe el predio de todas las publicaciones.
- **Crear y editar publicación** (`crear-publicacion.use-case.ts`, `editar-publicacion.use-case.ts`):
  - Nueva regla de dominio `validarDatosPorTipo(tipoPropiedad, casa)`: CASA exige habitaciones, baños y área construida (422). LOTE o TERRENO con `casa` presente → 422.
  - `tipoPropiedad` omitido en la creación se resuelve a `'TERRENO'` en el caso de uso, para que los clientes anteriores (y F09) sigan funcionando. El DTO solo valida la forma.
  - Editar `casa` en una publicación que no es CASA → 422.

---

### Contrato HTTP

Todas las respuestas de error siguen `{ statusCode, code, message, details?, path, timestamp, requestId }`.

| Endpoint | Request | Respuesta OK | Errores |
|---|---|---|---|
| `GET /publicaciones` | Query: filtros actuales + `lat`, `lng`, `radioKm` (0.1–50), `tipoPropiedad`, `habitacionesMin`, `banosMin`, `orden` incl. `DISTANCIA` | 200 `Pagina` con `items[]` que ahora traen `tipoPropiedad`, `latitud`, `longitud`, `distanciaKm \| null`, `habitaciones`, `banos`, `areaConstruidaM2`. Sin `*Exacta`. | 400 parámetros incompletos o fuera de rango; 422 filtros de casa con otro tipo |
| `POST /publicaciones` | Cuerpo actual + `tipoPropiedad?` (por defecto TERRENO) + `casa?{habitaciones, banos, areaConstruidaM2, niveles?, estacionamientos?}` | 201 vista de detalle | 400 forma; 401; 403 sin cuenta de vendedor; 422 CASA sin `casa`, `casa` en otro tipo, imagen no del sistema; 403 imagen de otro usuario |
| `PATCH /publicaciones/:id` | Cuerpo actual + `casa?` parcial | 200 detalle | 400 (`tipoPropiedad` no editable); 403 ajena; 422 `casa` en no-CASA |
| `POST /publicaciones/:id/fotografias` | Igual | 201 galería | 403 imagen de otro; 422 imagen no del sistema |
| `POST /archivos/imagenes`, `/documentos` | Multipart, sin cambios | 201 `{ruta, url}` sin cambios | Sin cambios; registra la fila |
| `PATCH /auth/me` | `{ nombreCompleto?, telefono? }` | 200 `Usuario` | 400 sin campos o campos no permitidos; 401; 422 teléfono inválido o vendedor sin teléfono |
| `POST /auth/login`, `/registro/*`, `/refresh` | Sin cambios | Igual + `csrfToken` y `Set-Cookie` | Sin cambios |
| `POST /auth/logout` | Sin cambios | 204 y cookie borrada | 403 si falta CSRF cuando entra por cookie |
| `GET /auth/csrf` | — | 200 `{ csrfToken }` | 401 |
| `GET /admin/usuarios` | Query: `page`, `limit`, `rol?`, `estado?`, `q?` (≤100) | 200 `Pagina<UsuarioAdminResumen>` | 400, 401, 403 |
| `PATCH /admin/usuarios/:id/estado` | `{ estado: 'ACTIVA' \| 'BLOQUEADA', motivo? }` | 200 `{ idUsuario, estadoCuenta, estadoAnterior, huboCambio, sesionesCerradas }` | 400; 401; 403 rol o autobloqueo o bloqueo de admin; 404; 422 motivo |
| `GET /admin/publicaciones` | Query: `page`, `limit`, `estado?`, `tipoOperacion?`, `tipoPropiedad?`, `idVendedor?`, `q?` | 200 `Pagina` con estado, vendedor y `motivoRechazo` | 400, 401, 403 |
| `PATCH /admin/publicaciones/:id/moderacion` | `{ accion: 'RECHAZAR' \| 'RESTAURAR', motivo? }` | 200 `{ idPublicacion, estado, estadoAnterior, motivo }` | 400; 401; 403; 404; 409 estado cambió; 422 transición o motivo |
| `GET /admin/auditoria` | Query: `page`, `limit`, `accion?`, `entidad?`, `idEntidad?`, `idActor?`, `desde?`, `hasta?` | 200 `Pagina` con `{ idAuditoria, actor{idUsuario,nombre}, accion, entidad, idEntidad, detalle, fecha }`, orden fecha descendente | 400 fechas inválidas; 401; 403; 422 `desde > hasta` |
| `PATCH /admin/documentos/:id/revision` | Sin cambios | 200 sin cambios | + 409 si ya fue revisado por otro admin |
| `GET /health` | — | 200 `{ estado, baseDeDatos, postgis, esquema }` | 503 sin BD, sin PostGIS o con migraciones pendientes |

---

### Plan de pruebas

**Unitarias** (`npm test`, `node:test`, repositorios falsos). Se añaden archivos nuevos al glob `test/*.spec.ts`, para no engordar los actuales.

| Archivo | Pruebas |
|---|---|
| `test/dominio.spec.ts` (ampliar) | `validarFiltroCasa`; `validarDatosPorTipo` (CASA sin campos, LOTE con campos); `calcularModeracion` (todas las transiciones y motivo); `decidirCambioEstado` (autobloqueo, bloqueo de admin, sin motivo, mismo estado); `validarMismoTipoPropiedad`; `construirResumen` para CASA; `leerCookie`; `CsrfService` (válido, alterado, de otra cookie); `clasificar-referencias`; `rutaDesdeUrl` con URL ajena y path traversal; `construirAvisoBajaPrecio`. |
| `test/casos-de-uso.spec.ts` (ajustar) | Sustituir `NotifierFalso` (`:350-358`) por el fake de repositorio. Casos de P11: baja crea avisos; subida no crea; vendedor excluido; publicación PAUSADA no avisa; fallo del repo propaga el error y no deja efectos; el caso de uso ya no atrapa excepciones. |
| `test/admin.spec.ts` | `CambiarEstadoUsuarioUseCase`: bloqueo cierra sesiones y audita; mismo estado devuelve `huboCambio=false` sin segunda auditoría; 403 autobloqueo y 403 bloqueo de admin; 404; 422 sin motivo. `ModerarPublicacionUseCase`: RECHAZAR desde ACTIVA y PAUSADA, 422 desde VENDIDA, 422 sin motivo, RESTAURAR, 409 con el fake forzando `CONFLICTO`, notificación al vendedor con el motivo. `ListarAuditoriaUseCase`: filtros y `desde > hasta`. `RevisarDocumentoUseCase`: audita y devuelve 409 si ya fue revisado. |
| `test/perfil.spec.ts` | `ActualizarPerfilUseCase`: normaliza y valida teléfono, vendedor no puede vaciarlo, cambiar el teléfono baja `telefonoVerificado`, solo toca la fila del actor. |
| `test/archivos.spec.ts` | `ResolverImagenesService`: URL externa 422, ruta sin fila 422, documento usado como imagen 422, ajena 403, duplicada 422, propia OK. `SubirArchivoUseCase`: registra fila; si falla el registro, compensa y relanza. `LimpiarArchivosUseCase`: reciente se conserva, antiguo sin referencia se borra, antiguo con referencia se conserva, modo simulación no toca nada, repetir da `borrados=0`, huérfano de disco se borra, error por archivo cuenta en `errores`. |
| `test/comparaciones` (en `casos-de-uso.spec.ts`) | CASA + TERRENO → 422; CASA + CASA OK con resumen extendido. |

Las pruebas que cambian el contrato de los puertos (`PublicacionRepository`, `FileStorage`, `DocumentoRepository`, `UsuarioRepository`) obligan a actualizar los fakes existentes en `test/casos-de-uso.spec.ts`.

**Funcionales** (nuevos casos F23+ en `scripts/pruebas-funcionales.sh`)

El helper `publicacion_json` (`:47-55`) tiene las coordenadas fijas, así que se parametriza para poder crear publicaciones lejanas. Hace falta además una variante con cookie jar (`curl -c/-b`). La imagen de prueba se sube siempre con el token del vendedor correspondiente.

| ID | Qué verifica | Esperado |
|---|---|---|
| F23 | `PATCH /auth/me` cambia nombre y teléfono | 200 con los datos nuevos |
| F24 | `PATCH /auth/me` con `rol`/`correo`; con teléfono inválido; sin autenticar | 400 / 422 / 401 |
| F25 | Cliente y vendedor llaman a `/admin/usuarios` y `/admin/auditoria` | 403 en ambos |
| F26 | Admin lista usuarios paginado, con filtro `rol=VENDEDOR` | 200, todos VENDEDOR, `totalPages` coherente |
| F27 | Admin bloquea al vendedor 2 con motivo; el token del bloqueado; su login | 200; `/auth/me` 401; login 403 |
| F28 | Bloquear otra vez al mismo usuario | 200 `huboCambio=false`; el conteo de auditoría `USUARIO_BLOQUEADO` no sube |
| F29 | Admin se bloquea a sí mismo; bloqueo sin motivo | 403; 422 |
| F30 | Publicaciones del bloqueado en `GET /publicaciones`, por radio y en el detalle anónimo | No aparecen; el detalle da 404 |
| F31 | Admin reactiva al vendedor 2 | 200; vuelve a poder iniciar sesión; sus publicaciones reaparecen |
| F32 | Moderar: rechazo sin motivo; con motivo | 422; 200 con estado RECHAZADA |
| F33 | Publicación rechazada | Fuera del listado; detalle anónimo 404; el vendedor ve `motivoRechazo` |
| F34 | Cliente y vendedor llaman a `PATCH /admin/publicaciones/:id/moderacion` | 403 |
| F35 | Restaurar una rechazada; restaurar una no rechazada; rechazar una vendida | 200 y estado PAUSADA; 422; 422 |
| F36 | El vendedor recibe la notificación con el motivo | `/notificaciones` contiene el motivo |
| F37 | `GET /admin/auditoria` | Contiene bloqueo, activación, rechazo y restauración con el actor admin, y los filtros funcionan |
| F38 | Imagen externa en `POST /publicaciones` | 422 |
| F39 | Usar la imagen que subió otro vendedor | 403 |
| F40 | Usar un documento como foto; usar un documento ajeno en verificación | 422; 403 |
| F41 | Radio: publicación cercana y otra lejana (San Salvador, ~110 km de San Miguel); `lat=13.48&lng=-88.18&radioKm=5` | Aparece la cercana y no la lejana; cada item con `distanciaKm ≤ 5`; ningún `latitudExacta`; latitud con ≤2 decimales |
| F42 | Radio combinado con `precioMax` y con `tipoOperacion` | Solo las que cumplen todo |
| F43 | `orden=DISTANCIA` | `distanciaKm` ascendente |
| F44 | `radioKm=100`; solo `lat`; `orden=DISTANCIA` sin centro | 400 en los tres |
| F45 | Crear CASA completa; crear CASA sin habitaciones; crear TERRENO con `casa` | 201; 422; 422 |
| F46 | Filtro `tipoPropiedad=CASA&habitacionesMin=3`; `tipoPropiedad=TERRENO&habitacionesMin=3` | Solo casas con ≥3; 422 |
| F47 | Comparar CASA con TERRENO; CASA con CASA | 422; 201 |
| F48 | Dos bajas de precio seguidas sobre la misma publicación con un favorito | Una notificación por cada baja, sin duplicados |
| F49 | Login con cookie jar; `GET /auth/me` con cookie | 200 con `Set-Cookie: HttpOnly` |
| F50 | `PATCH /auth/me` con cookie sin `X-CSRF-Token`; con token erróneo; con el token de `/auth/csrf` | 403; 403; 200 |
| F51 | El mismo `PATCH` con `Authorization: Bearer` y sin header CSRF | 200 |
| F52 | Cookie más `Origin: https://evil.example` | 403 |
| F53 | Preflight con `Origin` no permitido | Sin `Access-Control-Allow-Origin` |
| F54 | Logout por cookie borra la cookie; la cookie vieja da 401 | 204; 401 |
| F55 | `GET /health` | Incluye `postgis: true` |
| F56 (opcional, requiere `psql` y `DATABASE_URL`) | Subir una imagen sin usarla, envejecer su fila con `UPDATE archivos SET fecha = now() - interval '25 hours'`, ejecutar `npm run archivos:limpiar`, pedir la URL | Antes 200, después 404; con `--simulacion` sigue 200 |

El resto de F01–F22 debe seguir pasando sin cambios. En particular F09 crea publicaciones sin `tipoPropiedad` y F15 filtra el listado.

---

### Build sequence (PRs)

Cada PR actualiza, cuando toca esquema: la migración, `db/scriptdb.sql`, `prisma/schema.prisma`, la constante `MIGRACIONES_REQUERIDAS`, sus pruebas y los casos funcionales. Los PR de esquema se fusionan de uno en uno y los siguientes se rebasan, porque comparten `scriptdb.sql` y `schema.prisma`. Convención: ramas `feat/...`, `fix/...`, commits convencionales (`feat(db): ...`).

| # | Rama | Contenido | Depende de |
|---|---|---|---|
| 1 | `feat/migraciones-versionadas` | Carpeta `db/migraciones/` con `001_inicial.sql`; `schema_migraciones`; `scripts/db-migrar.mjs` y `npm run db:migrar`; `scriptdb.sql` con el registro de versiones; `docker-compose.yml` con imagen PostGIS y volumen de migraciones; `.env.example`; instrucciones de Windows en el README. Opcional: `db-verificar-esquema.mjs`. | — |
| 2 | `fix/baja-precio-atomica` | Migración 007; cambio de puerto del repositorio; elimina el puerto notifier y su adaptador; casos de uso y pruebas de P11; F48. | 1 |
| 3 | `feat/request-id-y-observabilidad` | Middleware `X-Request-Id`, filtro con `requestId`, interceptor de log de acceso, healthcheck con PostGIS y migraciones. Se fusiona antes de los PR administrativos para que ya estén instrumentados. | 1 |
| 4 | `feat/sesion-cookie-csrf` | Cookie HttpOnly, `CsrfService` y `CsrfGuard`, `GET /auth/csrf`, CORS con credenciales, validación de entorno, F49–F54. Independiente del esquema. | — |
| 5 | `feat/perfil-editar` | `PATCH /auth/me`, caso de uso, regla de dominio, pruebas, F23–F24. Pequeño; puede ir en paralelo con los demás. | — |
| 6 | `feat/auditoria` | Migración 004; tipos compartidos y `auditoria-writer`; módulo `administracion` (esqueleto) con `GET /admin/auditoria`; auditoría y 409 en la revisión de documentos; pruebas; F25 y F37 parcial. | 1, 3 |
| 7 | `feat/admin-usuarios` | Bloqueo/activación y listado de usuarios; cierre de sesiones; filtro de usuarios bloqueados en listado, detalle y comparaciones; F26–F31. | 6 |
| 8 | `feat/moderacion-publicaciones` | Migración 005; moderación y listado de administración; `cambiarEstado` condicional; notificación al vendedor; `motivoRechazo` en la vista; F32–F36 y F37 completo. | 6 |
| 9 | `feat/postgis-busqueda-cercania` | Migración 002; `Unsupported` en Prisma; consulta por radio; orden DISTANCIA; coordenadas públicas en el listado; healthcheck de PostGIS; F41–F44. Conviene fusionarlo pronto para que todo el equipo instale PostGIS temprano. | 1, 3 |
| 10 | `feat/tipos-inmueble` | Migración 003; campos de casa; filtros nuevos; reglas de dominio; vistas; comparaciones por tipo; F45–F47. Toca las mismas clases que el PR 9 y el 11: se rebasa sobre el último fusionado. | 1 (y 9, para rebasar) |
| 11 | `feat/archivos-robustos` | Migración 006; tabla `archivos`; servicio de resolución; cambios en `FileStorage`; validación en publicaciones y documentos; CLI `archivos:limpiar`; F38–F40 y F56. | 1 |
| 12 | `docs/actualizar-documentacion` | README, `docs/arquitectura.md`, `docs/pruebas.md`, `docs/iso25010.md` (ver abajo). Se puede ir avanzando por PR, pero la pasada final va al cierre. | Todos |

Orden recomendado de fusión: 1 → 3 → 2 y 5 (en paralelo) → 4 → 9 → 6 → 7 y 8 → 10 → 11 → 12. Los PR 2, 4 y 5 no dependen de nada del paquete administrativo.

**Para la reforma de `scriptdb.sql`:** al fusionar un PR de esquema, el siguiente debe regenerar el archivo sobre el resultado, no editar a ciegas. Es el único punto de fricción previsible.

---

### Risks and open questions

**Riesgos técnicos**
- **Columna generada con `geography`.** La expresión debe ser IMMUTABLE. Si PostGIS de algún integrante (Stack Builder) no la acepta, el plan B es un trigger. Se verifica en el PR 9 con la versión instalada del equipo.
- **PostGIS en Windows.** Cada integrante debe instalarlo antes de aplicar la migración 002. Sin él, `db:migrar` falla en esa versión y el healthcheck devuelve 503 con el motivo.
- **Precisión del punto público.** Al estar redondeado a ~1 km, `distanciaKm` es aproximada y los radios menores de 1 km se cuantizan. Se documenta en el contrato y en Swagger. No se cambia la regla de aproximación sin una decisión del equipo.
- **Orden por DISTANCIA en memoria.** Válido con cientos de publicaciones (tope 2000 candidatas). Si el catálogo crece mucho, se moverá la paginación a SQL.
- **Token CSRF derivado de la cookie.** Si cambia `JWT_SECRET`, todos los tokens CSRF y las sesiones dejan de valer a la vez. Es consistente con el diseño actual.
- **El token sigue en el cuerpo de login.** Un frontend que lo guarde en JS anula parte del valor de HttpOnly. Se mitiga con la documentación.
- **Fotos legadas externas.** Quedan `externa = TRUE` y no pasan por el CLI ni por la validación de propiedad. Es deuda aceptada, consultable por SQL.
- **Subidas sin cuota.** Un vendedor puede acumular archivos sin referencia durante 24 h. El throttle actual (30/min en `archivos.controller.ts:18`) lo acota. Una cuota por usuario queda fuera del alcance.
- **Disco local.** El barrido de disco solo sirve con una instancia y almacenamiento local, igual que hoy.

**Preguntas abiertas (con el valor por defecto elegido en el diseño)**
1. ¿Qué significa `INACTIVA` en `usuarios.estado_cuenta`? Por defecto, el endpoint solo acepta ACTIVA y BLOQUEADA; pasar de INACTIVA a ACTIVA se permite.
2. ¿Los baños admiten medios baños? Por defecto, entero 1–30.
3. ¿LOTE y TERRENO se pueden comparar entre sí? Por defecto no (mismo tipo estricto).
4. ¿PENDIENTE es rechazable? Por defecto no, solo ACTIVA y PAUSADA (según lo acordado).
5. ¿El vendedor bloqueado debe recibir un correo o aviso? Por defecto no, porque no puede iniciar sesión.
6. ¿La lista cerrada de acciones de auditoría debe incluir más acciones (p. ej. cambios de perfil)? Por defecto no.
7. ¿`SameSite` en producción? Por defecto `lax`. Si el frontend y la API quedan en dominios distintos, habrá que pasar a `none` + `Secure`.

**Fuera de alcance**
- Frontend (React + Vite).
- S3 o cualquier almacenamiento de objetos (el puerto `FileStorage` ya lo permite).
- Despliegue, HTTPS y proxy inverso.
- Backend de métricas (Prometheus u otro).
- Correlación del `requestId` dentro de los casos de uso (AsyncLocalStorage).
- Migrar las fotos externas legadas.
- Cuotas de subida por usuario.

**Documentación a actualizar**
- `README.md`: reemplazar la sección de base de datos (`:35-39`, `:59`, `:61`) por el flujo `db:migrar`; instalación de PostGIS en Windows con Stack Builder; imagen de Docker nueva y nota sobre volúmenes existentes; variables `COOKIE_SAMESITE` y `COOKIE_SECURE`; `npm run archivos:limpiar`; nueva lista de endpoints.
- `docs/arquitectura.md`: módulo `administracion`; patrón de auditoría transaccional; esquema de migraciones; modelo de tipos de inmueble; decisión de la cookie y el CSRF; columnas geográficas generadas. La línea 33 ("la base la crea `db/scriptdb.sql`") queda obsoleta.
- `docs/pruebas.md`: nuevas filas F23–F56 con fecha y resultado real, y el conteo de pruebas unitarias nuevas.
- `docs/iso25010.md`: seguridad (CSRF, auditoría append-only, validación de propiedad de archivos), mantenibilidad (migraciones versionadas), fiabilidad (atomicidad de la baja de precio), portabilidad (PostGIS como dependencia nueva).

**Archivos clave leídos (rutas absolutas)**
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/db/scriptdb.sql`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/prisma/schema.prisma`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/src/modules/publicaciones/infrastructure/prisma-publicacion.repository.ts`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/src/modules/publicaciones/application/actualizar-precio.use-case.ts`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/src/shared/infrastructure/security/jwt-auth.guard.ts`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/src/main.ts`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/src/modules/verificacion/infrastructure/prisma-documento.repository.ts`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/docker-compose.yml`
- `/home/user/aplicacion-de-tecnicas-de-ingenieria-pruebas/scripts/pruebas-funcionales.sh`