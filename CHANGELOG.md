# Changelog

## 1.1.0 (pendiente de publicar tras integrar los PR #6–#14)
Fase 2: lo que pedía el documento de arquitectura y faltaba o estaba parcial (diseño en `docs/diseno-fase2.md`).
- feat(db): migraciones SQL versionadas (`db/migraciones/`, `npm run db:migrar`); `scriptdb.sql` generado.
- feat: búsqueda por cercanía con PostGIS (`lat`, `lng`, `radioKm`, orden por distancia) y coordenadas públicas en el listado.
- feat: tipos de inmueble CASA, LOTE y TERRENO con datos de casa y filtros; P12 compara solo el mismo tipo.
- feat(admin): gestión de usuarios (bloquear/reactivar), moderación de publicaciones y auditoría inalterable.
- feat(auth): sesión por cookie HttpOnly con CSRF (se mantiene Bearer); `PATCH /auth/me`.
- feat(archivos): registro de archivos con dueño y `npm run archivos:limpiar`.
- feat: `X-Request-Id`, log de acceso y healthcheck de PostGIS y migraciones.
- fix: avisos de baja de precio atómicos; UPDATE condicional en cambios de estado y revisión de documentos; fotos y documentos solo propios.
- test: 82 pruebas unitarias y 61 comprobaciones funcionales (F01–F56).

## 1.0.1 (pendiente de publicar tras integrar los PR #1–#5)
- Primera ejecución real de extremo a extremo: instalación, build, BD PostgreSQL 16, seed y API (2026-11-25).
- fix(cambio-rol): P03 responde 422 con `requisitosPendientes` (antes 400 sin DUI), permite completar el teléfono y registra las solicitudes rechazadas.
- fix(comparaciones): P12 responde 422 al comparar 1 o más de 4 terrenos (antes 400).
- test: 19 pruebas unitarias de casos de uso con repositorios falsos (38 en total) y script de pruebas funcionales F01–F22.
- docs: resultados reales de las pruebas funcionales, numeración de procesos según Lab3, ISO/IEC 25010 y README actualizados; `package-lock.json` versionado.

## 1.0.0
- Primera versión funcional: auth, cambio de rol, publicaciones, favoritos, comparaciones, notificaciones, archivos y verificación de vendedores.
- Pruebas unitarias de dominio y documentación técnica en `docs/`.
