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
