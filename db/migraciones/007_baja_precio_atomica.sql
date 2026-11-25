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
