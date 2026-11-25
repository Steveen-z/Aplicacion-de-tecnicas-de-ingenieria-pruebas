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

## 2. Registro de pruebas funcionales (API)
Se ejecutan con Swagger (`/api/docs`) o `curl` contra el sistema levantado. **Columna "Resultado": completar al ejecutar; no se ha ejecutado aún contra una BD real.**

| ID | Proceso | Caso | Esperado | Resultado | Fecha / quién |
|---|---|---|---|---|---|
| F01 | P01 | Registrar cliente con datos válidos | 201 + token | | |
| F02 | P01 | Registrar con correo repetido | 409 | | |
| F03 | P01 | Contraseña débil / campo extra | 400 | | |
| F04 | Auth | Login correcto / incorrecto | 200 / 401 | | |
| F05 | Auth | Logout y reutilizar token | 401 tras logout | | |
| F06 | P02 | Registrar vendedor | 201, rol VENDEDOR | | |
| F07 | P03 | Cliente sin DUI/WhatsApp solicita rol | 422 con `requisitosPendientes` | | |
| F08 | P03 | Cliente con requisitos completos | rol cambia | | |
| F09 | P04 | Vendedor crea publicación | 201, estado definido | | |
| F10 | P04 | Cliente intenta crear | 403 | | |
| F11 | P05 | Editar publicación ajena | 403 | | |
| F12 | P06 | Cambiar precio | historial registrado; notificación a favoritos si baja | | |
| F13 | P07 | Subir imagen (jpg) / archivo falso (.php renombrado) | 201 / 400 | | |
| F14 | P07 | Más de 20 fotografías | 422 | | |
| F15 | P08 | Filtrar por departamento, precio, área, orden | resultados filtrados + paginación | | |
| F16 | P08 | Anónimo ve detalle | coordenadas aproximadas | | |
| F17 | P09 | Pausar / reactivar / marcar vendida | transiciones válidas; inválidas 422 | | |
| F18 | P10 | Alternar favorito y listar | agrega/quita | | |
| F19 | P11 | Obtener enlace WhatsApp sin sesión / con sesión | 401 / enlace `wa.me` | | |
| F20 | P12 | Comparar 2–4 terrenos misma operación | tabla con precio/m² y resumen | | |
| F21 | P12 | Comparar 1 o 5, o venta vs renta | 422 | | |
| F22 | Verif. | Vendedor sube documento; admin aprueba | estado VERIFICADO | | |

## 3. Errores identificados y correcciones
| # | Hallazgo | Corrección |
|---|---|---|
| 1 | `tsconfig` con `baseUrl`/`moduleResolution` incompatible con TypeScript reciente | Opciones eliminadas; imports relativos |
| 2 | `prisma/seed.ts` usaba `dotenv` sin declararlo | Añadido a devDependencies |
| 3 | Sin pruebas ejecutables | Añadido `test/dominio.spec.ts` y script `npm test` |

Agregar aquí los errores que aparezcan al ejecutar la tabla funcional, con el commit/PR que los corrige.
