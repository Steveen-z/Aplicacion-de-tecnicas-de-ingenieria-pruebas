# Changelog

## 1.0.1 (pendiente de publicar tras integrar los PR #1–#5)
- Primera ejecución real de extremo a extremo: instalación, build, BD PostgreSQL 16, seed y API (2026-11-25).
- fix(cambio-rol): P03 responde 422 con `requisitosPendientes` (antes 400 sin DUI), permite completar el teléfono y registra las solicitudes rechazadas.
- fix(comparaciones): P12 responde 422 al comparar 1 o más de 4 terrenos (antes 400).
- test: 19 pruebas unitarias de casos de uso con repositorios falsos (38 en total) y script de pruebas funcionales F01–F22.
- docs: resultados reales de las pruebas funcionales, numeración de procesos según Lab3, ISO/IEC 25010 y README actualizados; `package-lock.json` versionado.

## 1.0.0
- Primera versión funcional: auth, cambio de rol, publicaciones, favoritos, comparaciones, notificaciones, archivos y verificación de vendedores.
- Pruebas unitarias de dominio y documentación técnica en `docs/`.
