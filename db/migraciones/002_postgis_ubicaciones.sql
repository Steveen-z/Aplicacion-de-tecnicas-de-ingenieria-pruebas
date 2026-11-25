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
