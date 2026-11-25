# Pruebas

## 1. Pruebas unitarias (ejecutadas)
Archivo: `test/dominio.spec.ts` — ejecuta con `npm test` (usa `node:test`, sin librerías de pruebas extra).

Última ejecución (2026-11-23): **19 pruebas, 19 aprobadas, 0 fallidas**.
Cubren: validadores (DUI, teléfono, WhatsApp), máquina de estados de publicación (P09), coordenadas aproximadas, distancia/valoración de ubicación, estado de verificación del vendedor, comparación (P12), requisitos de cambio de rol (P03), detección de archivos por firma y rutas anti path-traversal.

## 1.1 Pruebas internas adicionales (2026-11-24)
| Prueba | Resultado |
|---|---|
| Coherencia `prisma/schema.prisma` ↔ `db/scriptdb.sql` (tablas y columnas mapeadas) | 0 discrepancias |
| Typecheck de `src/` y `test/` (TypeScript estricto) | Sin errores atribuibles al código propio; solo aparecen errores por paquetes no instalados (`@nestjs/*`, `@prisma/client`, `@types/node`) al no haber red en el entorno de desarrollo |
| `npm test` | 19/19 aprobadas |

Limitación: no se pudo levantar PostgreSQL ni instalar dependencias en ese entorno, por lo que la API no se ejecutó de extremo a extremo. Ejecutar la tabla funcional tras `npm install`.

## 1.2 Pruebas unitarias de casos de uso (2026-11-25)
Archivo: `test/casos-de-uso.spec.ts` — 19 pruebas de la capa *application* con repositorios y servicios falsos en memoria (sin BD, red ni NestJS en ejecución): registro de cliente (P02), login, cambio de rol (P03), cambio de precio (P11) y comparación (P12).

Última ejecución de `npm test` (2026-11-25): **38 pruebas, 38 aprobadas, 0 fallidas** (19 de dominio + 19 de casos de uso).
Control de calidad de las pruebas: al invertir a propósito la condición de baja de precio en `ActualizarPrecioUseCase`, 2 pruebas fallan (se revirtió el cambio).

## 1.3 Compilación y arranque reales (2026-11-25)
| Paso | Resultado |
|---|---|
| `npm install` (Node 22) | OK. `package-lock.json` no estaba versionado; se añadió |
| `npx prisma generate` | OK (Prisma Client 6.19) |
| `npm run typecheck` | 0 errores |
| `npm run build` | OK, genera `dist/` |
| PostgreSQL 16 local + `db/scriptdb.sql` | 15 tablas y 11 índices creados sin errores (Docker no disponible en el entorno; se usó el PostgreSQL instalado con el mismo script) |
| `npm run db:seed` | Administrador creado (id 1) |
| `npm run start:dev` | Arranca sin errores de inyección de dependencias; `GET /api/health` → `{"estado":"ok","baseDeDatos":"conectada"}`; Swagger en `/api/docs` → 200 |

## 2. Registro de pruebas funcionales (API)
Ejecutadas contra la API real (PostgreSQL 16 + `npm run start:dev`) con el script `scripts/pruebas-funcionales.sh` (curl + jq), que se puede repetir:

```bash
bash scripts/pruebas-funcionales.sh   # requiere la API levantada y el admin del seed
```

La numeración de procesos sigue el documento Lab3 (P01 registrar vendedor, P02 registrar cliente, P04 consultar, P05 filtrar, P06 detalle, P07 WhatsApp, P08 publicar, P09 gestionar, P10 favoritos, P11 precio, P12 comparar). La versión anterior de esta tabla usaba otra numeración (error #4).

Primera ejecución sobre `main` (v1.0.0 sin correcciones), 2026-11-25: 20 OK / 5 fallas, de las cuales 3 eran errores del propio script (F13, F16, F22) y 2 eran defectos reales de la API (F07b, F21). Ejecución final con las correcciones de los PR #2 y #3, **2026-11-25 04:52 UTC: 26 comprobaciones, 26 aprobadas, 0 fallidas**.

| ID | Proceso | Caso | Esperado | Resultado real | Fecha / quién |
|---|---|---|---|---|---|
| F01 | P02 | Registrar cliente con datos válidos | 201 + token | OK: 201, devuelve token Bearer | 2026-11-25 / script, sesión Claude Code |
| F02 | P02 | Registrar con correo repetido | 409 | OK: 409 | 2026-11-25 / script |
| F03 | P02 | Contraseña débil / campo extra (`rol`) | 400 | OK: 400 / 400 | 2026-11-25 / script |
| F04 | Auth | Login correcto / incorrecto | 200 / 401 | OK: 200 / 401 | 2026-11-25 / script |
| F05 | Auth | Logout y reutilizar token | 401 tras logout | OK: logout 204, `GET /auth/me` con el mismo token → 401 | 2026-11-25 / script |
| F06 | P01 | Registrar vendedor | 201, rol VENDEDOR | OK: 201, `usuario.rol = VENDEDOR` | 2026-11-25 / script |
| F07 | P03 | Cliente sin teléfono/DUI/WhatsApp solicita rol | 422 con `requisitosPendientes` | Antes: sin teléfono → 422 OK, pero **sin DUI → 400** (falla, error #5). Después del PR #2: ambos 422 con la lista de pendientes; además un cliente sin teléfono puede completarlo en la solicitud → 201 | 2026-11-25 / script |
| F08 | P03 | Cliente con requisitos completos | rol cambia | OK: 201, `/auth/me` → VENDEDOR; el mismo token puede publicar (201) | 2026-11-25 / script |
| F09 | P08 | Vendedor crea publicación | 201, estado definido | OK: 201, estado ACTIVA | 2026-11-25 / script |
| F10 | P08 | Cliente intenta crear | 403 | OK: 403 | 2026-11-25 / script |
| F11 | P09 | Editar publicación ajena | 403 | OK: 403 | 2026-11-25 / script |
| F12 | P11 | Cambiar precio | historial registrado; notificación a favoritos si baja | OK: 200, historial con el nuevo precio y notificación al cliente que la tenía en favoritos | 2026-11-25 / script |
| F13 | P08 | Subir imagen (jpg) / archivo falso (.php renombrado) | 201 / rechazo | OK: 201 / **422** "Formato no permitido" (se detecta por firma binaria). El plan decía 400; la API usa 422 de forma consistente para reglas sobre archivos, se corrige el esperado (error #7) | 2026-11-25 / script |
| F14 | P08 | Más de 20 fotografías | 422 | OK: 422 (1 existente + 20 nuevas) | 2026-11-25 / script |
| F15 | P05 | Filtrar por departamento, precio, área, orden | resultados filtrados + paginación | OK: 200, todos de San Miguel, respuesta con `items`, `page`, `limit`, `total`, `totalPages` | 2026-11-25 / script |
| F16 | P06 | Anónimo ve detalle | coordenadas aproximadas | OK: anónimo recibe 13.48 sin `latitudExacta`; el dueño recibe 13.4833333. Puntos de interés: `SIN_DATOS` (Overpass no accesible desde el entorno, comportamiento previsto) | 2026-11-25 / script |
| F17 | P09 | Pausar / reactivar / marcar vendida | transiciones válidas; inválidas 422 | OK: 200/200/200; reactivar vendida → 422; marcar rentada una venta → 422 | 2026-11-25 / script |
| F18 | P10 | Alternar favorito y listar | agrega/quita | OK: aparece en `GET /favoritos` y desaparece al alternar de nuevo | 2026-11-25 / script |
| F19 | P07 | Obtener enlace WhatsApp sin sesión / con sesión | 401 / enlace `wa.me` | OK: 401 / 200 con enlace `wa.me` | 2026-11-25 / script |
| F20 | P12 | Comparar 2–4 terrenos misma operación | tabla con precio/m² y resumen | OK: 201, terrenos con `precioPorM2` y `resumen` | 2026-11-25 / script |
| F21 | P12 | Comparar 1 o 5, o venta vs renta | 422 | Antes: **1 y 5 → 400** (falla, error #6); venta vs renta → 422. Después del PR #3: 422 / 422 / 422 | 2026-11-25 / script |
| F22 | Verif. | Vendedor sube documento; admin aprueba | estado VERIFICADO | OK: documento 201, revisión 200, estado del vendedor VERIFICADO | 2026-11-25 / script |

### Comprobaciones adicionales (2026-11-25, curl manual)
| Comprobación | Resultado |
|---|---|
| Rate limiting de login (5/min por IP) | Tras el límite, respuestas 429 |
| JWT con `alg: none` / token inventado | 401 |
| Id no numérico (`/publicaciones/abc`) | 400 |
| Cabeceras helmet | `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` presentes |
| 20 peticiones seguidas a `GET /publicaciones?limit=20` (BD con 16 publicaciones, 13 activas) | 0,18 s en total (~9 ms por petición); no es una prueba de carga |

## 1.4 Pruebas unitarias tras la fase 2 (2026-11-25)
`npm test` ejecuta todos los `test/*.spec.ts` (node:test + tsx, sin base de datos ni red). Última ejecución, sobre una instalación limpia (`npm ci`): **82 pruebas, 82 aprobadas, 0 fallidas**.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `test/dominio.spec.ts` | 22 | Validadores, estados P09, coordenadas, comparación, requisitos P03, archivos por firma, aviso de baja de precio, tipos de inmueble |
| `test/casos-de-uso.spec.ts` | 24 | Registro, login, perfil propio, P03, P11 (atomicidad simulada), P12 (incluye tipos de inmueble) |
| `test/admin.spec.ts` | 14 | Reglas de bloqueo y moderación; casos de uso de usuarios, moderación, auditoría, revisión de documentos y cambio de estado concurrente |
| `test/archivos.spec.ts` | 11 | Propiedad de imágenes y documentos, subida con compensación, limpieza de huérfanos, `LocalFileStorage` (incluye path traversal) |
| `test/seguridad.spec.ts` | 6 | Cookie de sesión, token CSRF, decisión del guard CSRF, validación de entorno |
| `test/esquema.spec.ts` | 3 | `db/scriptdb.sql` generado desde las migraciones; formato de migraciones; migraciones requeridas por el healthcheck |
| `test/dto.spec.ts` | 2 | Validación de los parámetros de búsqueda por cercanía |

## 2.1 Pruebas funcionales de la fase 2 (F23–F56)
Mismo script (`scripts/pruebas-funcionales.sh`), API real con PostgreSQL 16 + PostGIS 3.4.2. **Ejecución final, 2026-11-25 14:25 UTC, sobre una base nueva** (base vacía → `npm run db:migrar` → `npm run db:seed` → `npm run start:dev` → `PRUEBA_LIMPIEZA=1 bash scripts/pruebas-funcionales.sh`): **61 comprobaciones, 61 aprobadas, 0 fallidas** (F01–F22 y F23–F56). El caso F56 solo se ejecuta con `PRUEBA_LIMPIEZA=1` porque borra archivos sin uso de la base local.

| ID | Área | Caso | Esperado | Resultado real (2026-11-25, script) |
|---|---|---|---|---|
| F23 | Perfil | `PATCH /auth/me` cambia nombre y teléfono | 200 con los datos nuevos | OK: 200, teléfono normalizado |
| F24 | Perfil | Campo `rol` / teléfono inválido / sin sesión | 400 / 422 / 401 | OK: 400 / 422 / 401 |
| F25 | Admin | Cliente y vendedor en `/admin/usuarios`, `/admin/auditoria` y moderación | 403 | OK: 403 / 403 / 403 |
| F26 | Admin | Listar usuarios con `rol=VENDEDOR`, paginado | Todos VENDEDOR, sin `passwordHash` | OK |
| F27 | Admin | Bloquear al vendedor 2 con motivo; su token; su login | 200 / 401 / 403 | OK: 200 (1 sesión cerrada) / 401 / 403 |
| F28 | Admin | Bloquear otra vez | 200 `huboCambio=false`, auditoría +1 solo la primera vez | OK: auditoría 0 → 1 |
| F29 | Admin | Autobloqueo / bloqueo sin motivo | 403 / 422 | OK |
| F30 | Admin | Publicaciones del bloqueado en listado, radio y detalle | No aparecen; detalle anónimo 404, admin 200 | OK |
| F31 | Admin | Reactivar al vendedor 2 | Sus publicaciones reaparecen | OK |
| F32 | Moderación | Rechazar sin motivo / con motivo | 422 / 200 RECHAZADA | OK |
| F33 | Moderación | Publicación rechazada | Fuera del listado, detalle anónimo 404, el vendedor ve el motivo y no puede reactivarla (422) | OK |
| F34 | Moderación | Cliente y vendedor intentan moderar | 403 | OK |
| F35 | Moderación | Restaurar rechazada / restaurar no rechazada / rechazar vendida | 200 PAUSADA / 422 / 422 | OK |
| F36 | Moderación | Notificación al vendedor | Contiene el motivo | OK |
| F37 | Auditoría | Consulta y filtros | Bloqueo, activación, rechazo, restauración y aprobación con el admin como actor; filtro por entidad; fechas invertidas 422, fecha inválida 400 | OK |
| F38 | Archivos | Imagen externa o URL inventada del propio servidor | 422 | OK: 422 / 422 |
| F39 | Archivos | Imagen subida por otro vendedor al crear y al agregar fotos | 403 | OK: 403 / 403 |
| F40 | Archivos | Documento como foto / documento ajeno / propio | 422 / 403 / 201 | OK |
| F41 | PostGIS | Radio 5 km desde San Miguel y desde San Salvador | Incluye las cercanas y excluye la lejana (~112 km); `distanciaKm ≤ 5`; sin coordenadas exactas; 2 decimales | OK (F41 y F41b) |
| F42 | PostGIS | Radio + `precioMax` + `tipoOperacion` | Todas cumplen todo | OK |
| F43 | PostGIS | `orden=DISTANCIA` | Ascendente; la de Usulután (~30 km) al final | OK |
| F44 | PostGIS | `radioKm=100`, solo `lat`, DISTANCIA sin centro | 400 | OK: 400 / 400 / 400 |
| F45 | Inmuebles | CASA completa / CASA sin habitaciones / TERRENO con casa / LOTE | 201 / 422 / 422 / 201 | OK |
| F46 | Inmuebles | Casas con ≥ 4 habitaciones; `habitacionesMin` con TERRENO; filtro LOTE | Filtrado / 422 / solo el lote | OK |
| F47 | Inmuebles | CASA con TERRENO / dos casas / casa en un terreno / cambiar tipo | 422 / 201 con resumen ampliado / 422 / 400 | OK |
| F48 | P11 | Dos bajas seguidas con un favorito | Una notificación por baja, sin duplicados | OK: 1 + 1 |
| F49 | Sesión | Login del navegador | `Set-Cookie` HttpOnly, `Path=/api`; `/auth/me` con cookie 200 | OK |
| F50 | Sesión | Cookie sin token / token falso / token de `/auth/csrf` | 403 / 403 / 200 | OK |
| F51 | Sesión | Bearer sin cabecera CSRF | 200 | OK |
| F52 | Sesión | Cookie + token válido + `Origin` ajeno | 403 | OK |
| F53 | Sesión | Preflight CORS | Origen ajeno sin `Access-Control-Allow-Origin`; permitido con credentials | OK |
| F54 | Sesión | Logout por cookie | 204, cookie borrada, la vieja da 401 | OK |
| F55 | Salud | `GET /health` | Versión de PostGIS y esquema | OK: PostGIS 3.4.2, migraciones 001–007 |
| F56 | Archivos | Limpieza de una imagen huérfana envejecida | La simulación no borra; la limpieza sí (404); la foto en uso sigue (200); repetir borra 0 | OK |

### Comprobaciones adicionales de la fase 2 (2026-11-25)
| Comprobación | Resultado |
|---|---|
| Migraciones en una base nueva con `db:migrar`, con `scriptdb.sql` y en la base existente (`--baseline 001`) | `pg_dump -s` idéntico en los tres casos; reejecutar una migración aborta con "ya esta aplicada" |
| `/health` con una migración pendiente simulada / sin aplicar la 007 | 503 "Faltan migraciones de base de datos: … Ejecuta: npm run db:migrar" |
| Columna `geography` generada (002) en base desechable | Se calcula y se actualiza al cambiar coordenadas; San Miguel–San Salvador = 112 km |
| Auditoría (004) | CHECK acción↔entidad; UPDATE, DELETE y TRUNCATE → "La auditoria no se puede modificar ni borrar" |
| Tipos de inmueble (003) | La base rechaza CASA incompleta, LOTE con habitaciones y publicación sin tipo |
| Archivos (006) sobre una copia de la base de desarrollo | 12 imágenes y 13 documentos registrados, 76 fotos enlazadas, 1 externa conservada |
| Atomicidad de P11 | Con un trigger que hace fallar el INSERT de notificaciones, el PATCH de precio da 500 y precio e historial no cambian |
| Carrera en la revisión de documentos | 4 revisiones simultáneas → 1×200 y 3×409; una sola fila de auditoría |
| `X-Request-Id` | Se devuelve el enviado si es válido; `<script>` se reemplaza por un UUID; aparece en el cuerpo de los errores |
| Registro con una cookie vieja en el navegador | 201 (login y registro están exentos de CSRF) |
| `npm audit --omit=dev` | 4 avisos de severidad alta en dependencias transitivas (p. ej. `deepmerge-ts`, `effect`); pendiente de revisar |

## 3. Errores identificados y correcciones
| # | Hallazgo | Corrección |
|---|---|---|
| 1 | `tsconfig` con `baseUrl`/`moduleResolution` incompatible con TypeScript reciente | Opciones eliminadas; imports relativos |
| 2 | `prisma/seed.ts` usaba `dotenv` sin declararlo | Añadido a devDependencies |
| 3 | Sin pruebas ejecutables | Añadido `test/dominio.spec.ts` y script `npm test` |
| 4 | La tabla funcional usaba una numeración de procesos distinta a la del Lab3 (p. ej. P11 = WhatsApp, cuando en el Lab3 es el cambio de precio) | Columna "Proceso" corregida según el PDF (este cambio) |
| 5 | F07: P03 respondía 400 si faltaba el DUI o tenía mal formato (validación del DTO) en vez de 422 con `requisitosPendientes`; un cliente registrado sin teléfono no podía cumplir el requisito porque no hay endpoint para editar el perfil; WhatsApp no era obligatorio; las solicitudes no cumplidas no se registraban | PR #2 (`fix/p03-requisitos-422`): el dominio evalúa todos los requisitos (422), la solicitud acepta `telefono`, WhatsApp obligatorio, se guardan las solicitudes RECHAZADA con `requisitos_pendientes` |
| 6 | F21: comparar 1 o 5 terrenos respondía 400 (`@ArrayMinSize/@ArrayMaxSize` del DTO) sin llegar a la regla de P12 | PR #3 (`fix/p12-comparacion-422`): el DTO solo pone un tope técnico (1–20) y la regla 2–4 responde 422 |
| 7 | F13: el plan esperaba 400 para un archivo falso; la API responde 422 (regla de negocio) | Se corrige el valor esperado en la tabla; el archivo se rechaza correctamente por firma |
| 8 | `package-lock.json` sin versionar (instalaciones no reproducibles) | PR #1 lo añade junto al script de pruebas funcionales |
| 9 | Errores del propio script en la primera ejecución (lectura de `latitudExacta`, tipo de documento `DUI_FRENTE`, id anidado en `documento`) | Corregidos en el script (PR #1 y este PR); no eran defectos de la API |
| 10 | P11: el aviso de baja de precio se enviaba después de guardar el precio y su error se ignoraba (no atómico) | PR #8: precio, historial y notificaciones en una transacción; UNIQUE (usuario, historial) |
| 11 | No existía forma de editar el perfil propio (documento de arquitectura: "Su perfil") | PR #8: `PATCH /auth/me` |
| 12 | Pausar/reactivar/marcar del vendedor hacía un UPDATE sin condición y podía deshacer un rechazo del administrador | PR #11: UPDATE condicional y 409 |
| 13 | Dos administradores podían revisar a la vez el mismo documento (doble revisión) | PR #11: UPDATE condicional; carrera verificada (1×200, 3×409) |
| 14 | Al publicar se aceptaba cualquier URL como fotografía | PR #13: solo imágenes subidas por el mismo vendedor (422 / 403) |
| 15 | En verificación se aceptaba la ruta del documento de otro usuario | PR #13: solo documentos propios (403) |
| 16 | Prueba unitaria: la limpieza contaba dos veces un archivo cuyo borrado fallaba | PR #13: no se reprocesa una ruta en la misma ejecución |
| 17 | `npm run archivos:limpiar` fallaba al arrancar (el CLI cargaba el controlador y sus guards) | PR #13: `ArchivosCoreModule` sin HTTP para el CLI |
| 18 | Errores del propio script en la fase 2 (re-ejecutar dentro del límite de 1 minuto da 429; tokens cerrados por el bloqueo en F34/F40; `limit` máximo 50) | Corregidos en el script; para repetir la batería seguida hay que esperar un minuto o reiniciar la API (el contador del límite está en memoria) |
