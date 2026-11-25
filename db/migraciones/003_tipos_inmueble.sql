-- ============================================================
-- Migracion 003 - Tipos de inmueble: CASA, LOTE y TERRENO
-- Las publicaciones existentes pasan a TERRENO. Los datos de casa solo
-- existen (y son obligatorios) cuando el tipo es CASA; la base lo garantiza.
-- La tabla terrenos sigue describiendo el predio de toda publicacion
-- (para una CASA, area_m2 es el area del terreno donde esta construida).
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '003') THEN
    RAISE EXCEPTION 'La migracion 003 (tipos_inmueble) ya esta aplicada';
  END IF;
END $$;

ALTER TABLE publicaciones
    ADD COLUMN tipo_propiedad VARCHAR(10) NOT NULL DEFAULT 'TERRENO'
        CHECK (tipo_propiedad IN ('CASA', 'LOTE', 'TERRENO')),
    ADD COLUMN habitaciones       SMALLINT CHECK (habitaciones BETWEEN 1 AND 30),
    ADD COLUMN banos              SMALLINT CHECK (banos BETWEEN 1 AND 30),
    ADD COLUMN area_construida_m2 NUMERIC(10,2) CHECK (area_construida_m2 > 0),
    ADD COLUMN niveles            SMALLINT CHECK (niveles BETWEEN 1 AND 10),
    ADD COLUMN estacionamientos   SMALLINT CHECK (estacionamientos BETWEEN 0 AND 20);

-- La aplicacion siempre indica el tipo de forma explicita a partir de ahora.
ALTER TABLE publicaciones ALTER COLUMN tipo_propiedad DROP DEFAULT;

ALTER TABLE publicaciones
    ADD CONSTRAINT ck_publicaciones_casa CHECK (
        (tipo_propiedad = 'CASA'
            AND habitaciones IS NOT NULL AND banos IS NOT NULL AND area_construida_m2 IS NOT NULL)
        OR
        (tipo_propiedad <> 'CASA'
            AND habitaciones IS NULL AND banos IS NULL AND area_construida_m2 IS NULL
            AND niveles IS NULL AND estacionamientos IS NULL)
    );

CREATE INDEX idx_publicaciones_activas_tipo
    ON publicaciones(tipo_propiedad, tipo_operacion) WHERE estado = 'ACTIVA';

COMMENT ON COLUMN terrenos.area_m2 IS 'Area del predio en m2 (en una CASA, el area del terreno; la construida esta en publicaciones.area_construida_m2)';

INSERT INTO schema_migraciones (version, nombre) VALUES ('003', 'tipos_inmueble');

COMMIT;
