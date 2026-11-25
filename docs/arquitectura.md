# Arquitectura

Arquitectura limpia (Clean Architecture) organizada por módulos de negocio.

```
src/
  shared/        errores de dominio, paginación, validadores, puertos comunes, guards, filtro de excepciones
  modules/<m>/
    domain/          entidades, reglas puras, puertos (interfaces + token Symbol)
    application/     casos de uso (una clase por caso)
    infrastructure/  adaptadores: Prisma, bcrypt, JWT, Overpass, disco local
    presentation/    controladores REST + DTOs (class-validator)
```

Regla de dependencia: `presentation → application → domain ← infrastructure`. El dominio no importa NestJS ni Prisma.

## Módulos y procesos
| Módulo | Procesos (Lab3) |
|---|---|
| auth | P01 registro cliente, P02 registro vendedor, login/logout/refresh |
| cambio-rol | P03 solicitud de cambio de rol |
| publicaciones | P04 crear, P05 editar, P06 precio, P07 fotografías, P08 consultar/filtrar, P09 estado, P11 contacto WhatsApp |
| favoritos | P10 |
| comparaciones | P12 |
| verificacion, archivos, notificaciones | soporte (documentos del vendedor, subida segura, avisos) |

## Decisiones
- Ids BigInt de PostgreSQL convertidos a `number` en los adaptadores.
- Cambio de precio y registro en `historial_precios` en una sola transacción (`FOR UPDATE`).
- Coordenadas exactas solo para el dueño; el público recibe coordenadas aproximadas (2 decimales).
- Sesiones: JWT con `jti`; se guarda el hash sha256 en la tabla `sesiones` (revocable).
- Seguridad: bcrypt cost 12, helmet, throttling, ValidationPipe estricto, validación de archivos por firma binaria.
- La base la crea `db/scriptdb.sql`; Prisma solo genera el cliente.
