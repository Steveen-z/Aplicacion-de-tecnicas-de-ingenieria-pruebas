-- ============================================================
-- BASE DE DATOS: InmobiSV - plataforma de comercializacion de inmuebles
-- Motor: PostgreSQL 16 (+ PostGIS desde la migracion 002)
--
-- ARCHIVO GENERADO: no editar a mano. Es la concatenacion de
-- db/migraciones/*.sql (5 migraciones). Para cambiar el esquema, crea una
-- migracion nueva y ejecuta: npm run db:generar-script
--
-- Uso en una base NUEVA (vacia):
--   psql -U postgres -c "CREATE DATABASE plataforma_terrenos;"
--   psql -U postgres -d plataforma_terrenos -v ON_ERROR_STOP=1 -f db/scriptdb.sql
-- Para una base existente usa: npm run db:migrar
-- ============================================================

-- >>>>>>>>>>>>>>>>>>>> 001_inicial.sql

-- ============================================================
-- Migracion 001 - Esquema inicial (v1.0.0)
-- Basada en el diagrama UML del documento Lab3 Atis Correcion.
-- Ejecutar conectado a la base plataforma_terrenos (psql o pgAdmin).
-- Reejecutarla no cambia nada: la guarda aborta la transaccion.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migraciones (
    version      VARCHAR(10) PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL,
    aplicada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    aplicada_por TEXT NOT NULL DEFAULT current_user
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '001') THEN
    RAISE EXCEPTION 'La migracion 001 (inicial) ya esta aplicada';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. USUARIOS Y PERFILES
-- ------------------------------------------------------------

CREATE TABLE usuarios (
    id_usuario          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_completo     VARCHAR(150) NOT NULL,
    correo              VARCHAR(254) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    telefono            VARCHAR(25),
    telefono_verificado BOOLEAN NOT NULL DEFAULT FALSE,
    rol                 VARCHAR(20) NOT NULL DEFAULT 'CLIENTE'
                        CHECK (rol IN ('CLIENTE', 'VENDEDOR', 'ADMIN')),
    estado_cuenta       VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
                        CHECK (estado_cuenta IN ('ACTIVA', 'INACTIVA', 'BLOQUEADA')),
    fecha_registro      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tablas especializadas: un cliente/vendedor corresponde a un usuario.
CREATE TABLE clientes (
    id_cliente BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario BIGINT NOT NULL UNIQUE
        REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

CREATE TABLE vendedores (
    id_vendedor          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario           BIGINT NOT NULL UNIQUE
        REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    dui                  VARCHAR(10) UNIQUE,
    numero_whatsapp      VARCHAR(25),
    estado_verificacion  VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado_verificacion IN
                           ('PENDIENTE', 'EN_REVISION', 'VERIFICADO', 'RECHAZADO'))
);

-- ------------------------------------------------------------
-- 2. SESIONES Y CAMBIO DE ROL
-- ------------------------------------------------------------

CREATE TABLE sesiones (
    id_sesion          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario         BIGINT NOT NULL
        REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    token_hash         TEXT NOT NULL UNIQUE,
    fecha_inicio       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion   TIMESTAMPTZ NOT NULL,
    fecha_finalizacion TIMESTAMPTZ,
    activa             BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (fecha_expiracion > fecha_inicio)
);

CREATE TABLE solicitudes_cambio_rol (
    id_solicitud          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario            BIGINT NOT NULL
        REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    fecha_solicitud       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado                VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                          CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
    requisitos_pendientes TEXT,
    fecha_resolucion      TIMESTAMPTZ,
    observaciones         TEXT,
    CHECK (
      (estado = 'PENDIENTE' AND fecha_resolucion IS NULL)
      OR
      (estado IN ('APROBADA', 'RECHAZADA') AND fecha_resolucion IS NOT NULL)
    )
);

CREATE TABLE documentos_verificacion (
    id_documento       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_vendedor        BIGINT NOT NULL
        REFERENCES vendedores(id_vendedor) ON DELETE CASCADE,
    tipo_documento     VARCHAR(50) NOT NULL,
    ruta_documento     TEXT NOT NULL,
    fecha_envio        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_revision    VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                       CHECK (estado_revision IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    observaciones      TEXT,
    fecha_revision    TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 3. PUBLICACIONES, TERRENOS Y UBICACIONES
-- ------------------------------------------------------------

CREATE TABLE publicaciones (
    id_publicacion       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_vendedor          BIGINT NOT NULL
        REFERENCES vendedores(id_vendedor) ON DELETE RESTRICT,
    titulo               VARCHAR(180) NOT NULL,
    descripcion          TEXT NOT NULL,
    tipo_operacion       VARCHAR(15) NOT NULL DEFAULT 'VENTA'
                         CHECK (tipo_operacion IN ('VENTA', 'RENTA')),
    precio               NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
    estado               VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN
                           ('ACTIVA', 'PAUSADA', 'VENDIDA', 'RENTADA',
                            'PENDIENTE', 'RECHAZADA')),
    fecha_publicacion    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE terrenos (
    id_terreno       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion   BIGINT NOT NULL UNIQUE
        REFERENCES publicaciones(id_publicacion) ON DELETE CASCADE,
    area_m2          NUMERIC(14,2) NOT NULL CHECK (area_m2 > 0),
    largo_m          NUMERIC(12,2) CHECK (largo_m IS NULL OR largo_m > 0),
    ancho_m          NUMERIC(12,2) CHECK (ancho_m IS NULL OR ancho_m > 0),
    tipo_terreno     VARCHAR(80),
    caracteristicas  TEXT
);

CREATE TABLE ubicaciones (
    id_ubicacion       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_terreno         BIGINT NOT NULL UNIQUE
        REFERENCES terrenos(id_terreno) ON DELETE CASCADE,
    departamento      VARCHAR(100) NOT NULL,
    municipio         VARCHAR(100) NOT NULL,
    distrito          VARCHAR(100),
    direccion_detalle TEXT,
    latitud           NUMERIC(10,7)
                      CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
    longitud          NUMERIC(10,7)
                      CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180),
    latitud_publica   NUMERIC(10,7)
                      CHECK (latitud_publica IS NULL OR latitud_publica BETWEEN -90 AND 90),
    longitud_publica  NUMERIC(10,7)
                      CHECK (longitud_publica IS NULL OR longitud_publica BETWEEN -180 AND 180)
);


CREATE TABLE fotografias (
    id_fotografia    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion   BIGINT NOT NULL
        REFERENCES publicaciones(id_publicacion) ON DELETE CASCADE,
    url_imagen       TEXT NOT NULL,
    descripcion      VARCHAR(250),
    orden            INTEGER NOT NULL DEFAULT 1 CHECK (orden > 0),
    es_portada       BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_subida     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id_publicacion, orden)
);


CREATE TABLE favoritos (
    id_favorito          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cliente           BIGINT NOT NULL
        REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    id_publicacion       BIGINT NOT NULL
        REFERENCES publicaciones(id_publicacion) ON DELETE CASCADE,
    fecha_guardado       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    precio_al_guardar    NUMERIC(12,2) NOT NULL CHECK (precio_al_guardar >= 0),
    UNIQUE (id_cliente, id_publicacion)
);

CREATE TABLE historial_precios (
    id_historial       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion     BIGINT NOT NULL
        REFERENCES publicaciones(id_publicacion) ON DELETE CASCADE,
    precio_anterior    NUMERIC(12,2) NOT NULL CHECK (precio_anterior >= 0),
    precio_nuevo       NUMERIC(12,2) NOT NULL CHECK (precio_nuevo >= 0),
    fecha_cambio       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (precio_anterior <> precio_nuevo)
);

CREATE TABLE notificaciones (
    id_notificacion   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario        BIGINT NOT NULL
        REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_publicacion    BIGINT
        REFERENCES publicaciones(id_publicacion) ON DELETE SET NULL,
    titulo            VARCHAR(150) NOT NULL,
    mensaje           TEXT NOT NULL,
    tipo              VARCHAR(40) NOT NULL,
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leida             BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_lectura     TIMESTAMPTZ,
    CHECK (
      (leida = FALSE AND fecha_lectura IS NULL)
      OR
      (leida = TRUE AND fecha_lectura IS NOT NULL)
    )
);

-- ------------------------------------------------------------
-- 5. COMPARACION DE TERRENOS
-- Se agregan estas tablas para persistir las comparaciones del cliente.
-- ------------------------------------------------------------

CREATE TABLE comparaciones (
    id_comparacion BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cliente     BIGINT NOT NULL
        REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE detalle_comparacion (
    id_comparacion BIGINT NOT NULL
        REFERENCES comparaciones(id_comparacion) ON DELETE CASCADE,
    id_publicacion BIGINT NOT NULL
        REFERENCES publicaciones(id_publicacion) ON DELETE CASCADE,
    PRIMARY KEY (id_comparacion, id_publicacion)
);

-- ------------------------------------------------------------
-- 6. INDICES PARA CONSULTAS FRECUENTES
-- ------------------------------------------------------------

CREATE INDEX idx_publicaciones_estado
    ON publicaciones(estado);

CREATE INDEX idx_publicaciones_precio
    ON publicaciones(precio);

CREATE INDEX idx_publicaciones_vendedor
    ON publicaciones(id_vendedor);

CREATE INDEX idx_ubicaciones_departamento_municipio
    ON ubicaciones(departamento, municipio);

CREATE INDEX idx_terrenos_area
    ON terrenos(area_m2);

CREATE INDEX idx_fotografias_publicacion
    ON fotografias(id_publicacion);

CREATE INDEX idx_favoritos_cliente
    ON favoritos(id_cliente);

CREATE INDEX idx_historial_publicacion_fecha
    ON historial_precios(id_publicacion, fecha_cambio DESC);

CREATE INDEX idx_notificaciones_usuario_fecha
    ON notificaciones(id_usuario, fecha_creacion DESC);

CREATE INDEX idx_sesiones_usuario_activa
    ON sesiones(id_usuario, activa);

CREATE INDEX idx_solicitudes_usuario_estado
    ON solicitudes_cambio_rol(id_usuario, estado);

INSERT INTO schema_migraciones (version, nombre) VALUES ('001', 'inicial');

COMMIT;

-- NOTAS DE IMPLEMENTACION:
-- 1. password_hash debe contener el resultado de Argon2id o bcrypt
--    generado por el backend. Nunca guardar contrasenas en texto plano.
-- 2. token_hash debe guardar el hash del token de sesion, no el token original.
-- 3. url_imagen y ruta_documento guardan referencias a archivos almacenados
--    en un servicio de archivos/nube o servidor, no el binario de la imagen.
-- 4. La aplicacion debe validar que una publicacion tenga al menos una
--    fotografia antes de activarla (la cardinalidad minima 1..* del UML).
-- 5. Al cambiar publicaciones.precio, el backend debe insertar el precio
--    anterior y el nuevo en historial_precios dentro de una transaccion.
-- 6. Al aprobar una solicitud de cambio de rol, el backend debe crear el
--    perfil en vendedores y actualizar usuarios.rol a 'VENDEDOR'.

-- >>>>>>>>>>>>>>>>>>>> 002_postgis_ubicaciones.sql

-- ============================================================
-- Migracion 002 - PostGIS: puntos geograficos e indice espacial
-- Requiere la extension PostGIS instalada en el servidor
-- (Windows: Stack Builder > Spatial Extensions > PostGIS 3.x).
-- Las columnas decimales siguen siendo la fuente de verdad; los puntos se
-- calculan solos (columnas generadas), asi que no pueden desincronizarse.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '002') THEN
    RAISE EXCEPTION 'La migracion 002 (postgis_ubicaciones) ya esta aplicada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    RAISE EXCEPTION 'PostGIS no esta instalado en el servidor. Instalalo (Stack Builder > Spatial Extensions) y vuelve a ejecutar la migracion';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS postgis;

-- Punto publico (aproximado, el unico que se usa en busquedas y mapas).
ALTER TABLE ubicaciones
    ADD COLUMN punto_publico geography(Point, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_MakePoint(longitud_publica::float8, latitud_publica::float8), 4326)::geography
        ) STORED;

-- Punto exacto: dato restringido (solo dueno y administrador); sin indice porque no se consulta.
ALTER TABLE ubicaciones
    ADD COLUMN punto_exacto geography(Point, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_MakePoint(longitud::float8, latitud::float8), 4326)::geography
        ) STORED;

CREATE INDEX idx_ubicaciones_punto_publico ON ubicaciones USING GIST (punto_publico);

-- Comprobacion del calculo de las filas existentes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ubicaciones
             WHERE latitud_publica IS NOT NULL AND longitud_publica IS NOT NULL AND punto_publico IS NULL) THEN
    RAISE EXCEPTION 'No se pudo calcular punto_publico para alguna ubicacion existente';
  END IF;
END $$;

INSERT INTO schema_migraciones (version, nombre) VALUES ('002', 'postgis_ubicaciones');

COMMIT;

-- >>>>>>>>>>>>>>>>>>>> 004_auditoria.sql

-- ============================================================
-- Migracion 004 - Auditoria de operaciones administrativas
-- Actor, accion, fecha y registro afectado (documento de arquitectura).
-- Solo admite INSERT: UPDATE, DELETE y TRUNCATE lanzan excepcion.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '004') THEN
    RAISE EXCEPTION 'La migracion 004 (auditoria) ya esta aplicada';
  END IF;
END $$;

CREATE TABLE auditoria (
    id_auditoria BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_actor     BIGINT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    accion       VARCHAR(40) NOT NULL
                 CHECK (accion IN ('USUARIO_BLOQUEADO', 'USUARIO_ACTIVADO',
                                   'PUBLICACION_RECHAZADA', 'PUBLICACION_RESTAURADA',
                                   'DOCUMENTO_APROBADO', 'DOCUMENTO_RECHAZADO')),
    entidad      VARCHAR(20) NOT NULL CHECK (entidad IN ('USUARIO', 'PUBLICACION', 'DOCUMENTO')),
    id_entidad   BIGINT NOT NULL,
    detalle      JSONB NOT NULL DEFAULT '{}'::jsonb,
    fecha        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- La accion corresponde a la entidad (USUARIO_* -> USUARIO, etc.).
    CHECK (accion LIKE entidad || '\_%')
);

CREATE INDEX idx_auditoria_fecha ON auditoria(fecha DESC, id_auditoria DESC);
CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, id_entidad);
CREATE INDEX idx_auditoria_actor ON auditoria(id_actor, fecha DESC);

CREATE FUNCTION auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La auditoria no se puede modificar ni borrar';
END $$;

CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

CREATE TRIGGER trg_auditoria_sin_truncate
    BEFORE TRUNCATE ON auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inmutable();

INSERT INTO schema_migraciones (version, nombre) VALUES ('004', 'auditoria');

COMMIT;

-- >>>>>>>>>>>>>>>>>>>> 005_moderacion_publicaciones.sql

-- ============================================================
-- Migracion 005 - Moderacion de publicaciones por el administrador
-- Una publicacion RECHAZADA guarda el motivo; las demas no tienen motivo.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '005') THEN
    RAISE EXCEPTION 'La migracion 005 (moderacion_publicaciones) ya esta aplicada';
  END IF;
END $$;

ALTER TABLE publicaciones
    ADD COLUMN motivo_rechazo TEXT,
    ADD CONSTRAINT ck_publicaciones_motivo_rechazo
        CHECK (estado = 'RECHAZADA' OR motivo_rechazo IS NULL);

-- Listado de administracion por estado.
CREATE INDEX idx_publicaciones_estado_fecha ON publicaciones(estado, fecha_publicacion DESC);

INSERT INTO schema_migraciones (version, nombre) VALUES ('005', 'moderacion_publicaciones');

COMMIT;

-- >>>>>>>>>>>>>>>>>>>> 007_baja_precio_atomica.sql

-- ============================================================
-- Migracion 007 - Avisos de baja de precio atomicos y sin duplicados
-- Cada notificacion BAJA_PRECIO queda ligada al cambio de precio que la
-- origino; UNIQUE (id_usuario, id_historial) impide avisar dos veces.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '007') THEN
    RAISE EXCEPTION 'La migracion 007 (baja_precio_atomica) ya esta aplicada';
  END IF;
END $$;

ALTER TABLE notificaciones
    ADD COLUMN id_historial BIGINT
        REFERENCES historial_precios(id_historial) ON DELETE SET NULL;

ALTER TABLE notificaciones
    ADD CONSTRAINT uq_notificaciones_usuario_historial UNIQUE (id_usuario, id_historial);

-- Solo para filas nuevas: las notificaciones anteriores no tienen vinculo fiable.
ALTER TABLE notificaciones
    ADD CONSTRAINT ck_baja_precio_historial
        CHECK (tipo <> 'BAJA_PRECIO' OR id_historial IS NOT NULL) NOT VALID;

-- Destinatarios de un aviso: favoritos de una publicacion.
CREATE INDEX idx_favoritos_publicacion ON favoritos(id_publicacion);

INSERT INTO schema_migraciones (version, nombre) VALUES ('007', 'baja_precio_atomica');

COMMIT;
