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
