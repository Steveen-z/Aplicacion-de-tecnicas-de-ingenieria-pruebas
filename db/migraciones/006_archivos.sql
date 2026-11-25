-- ============================================================
-- Migracion 006 - Registro de archivos subidos
-- Cada archivo subido (imagen o documento) queda registrado con su dueno.
-- Las fotografias y los documentos solo pueden apuntar a archivos registrados
-- (clave del objeto); asi se valida la propiedad y se detectan los huerfanos.
-- Las fotografias antiguas con URL externa se conservan marcadas como externas.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migraciones WHERE version = '006') THEN
    RAISE EXCEPTION 'La migracion 006 (archivos) ya esta aplicada';
  END IF;
END $$;

CREATE TABLE archivos (
    id_archivo  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ruta        TEXT NOT NULL UNIQUE
                CHECK (ruta ~ '^(imagenes|documentos)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'),
    id_usuario  BIGINT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    categoria   VARCHAR(10) NOT NULL CHECK (categoria IN ('IMAGEN', 'DOCUMENTO')),
    fecha       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((categoria = 'IMAGEN' AND ruta LIKE 'imagenes/%' AND ruta !~ '\.pdf$')
        OR (categoria = 'DOCUMENTO' AND ruta LIKE 'documentos/%' AND ruta !~ '\.webp$'))
);
CREATE INDEX idx_archivos_fecha ON archivos(fecha);

-- Fotografias: clave del objeto (ruta) + URL de entrega (url_imagen).
ALTER TABLE fotografias
    ADD COLUMN ruta TEXT,
    ADD COLUMN externa BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE fotografias
SET ruta = substring(url_imagen FROM '/uploads/(imagenes/[0-9a-f-]{36}\.(jpg|png|webp))$');
UPDATE fotografias SET externa = TRUE WHERE ruta IS NULL;

-- Archivos ya referenciados: el dueno es el usuario del vendedor de la primera publicacion que lo usa.
INSERT INTO archivos (ruta, id_usuario, categoria, fecha)
SELECT DISTINCT ON (f.ruta) f.ruta, v.id_usuario, 'IMAGEN', f.fecha_subida
FROM fotografias f
JOIN publicaciones p ON p.id_publicacion = f.id_publicacion
JOIN vendedores v ON v.id_vendedor = p.id_vendedor
WHERE f.ruta IS NOT NULL
ORDER BY f.ruta, f.fecha_subida
ON CONFLICT (ruta) DO NOTHING;

INSERT INTO archivos (ruta, id_usuario, categoria, fecha)
SELECT DISTINCT ON (d.ruta_documento) d.ruta_documento, v.id_usuario, 'DOCUMENTO', d.fecha_envio
FROM documentos_verificacion d
JOIN vendedores v ON v.id_vendedor = d.id_vendedor
ORDER BY d.ruta_documento, d.fecha_envio
ON CONFLICT (ruta) DO NOTHING;

ALTER TABLE fotografias
    ADD CONSTRAINT ck_fotografias_ruta_externa
        CHECK ((externa AND ruta IS NULL) OR (NOT externa AND ruta IS NOT NULL)),
    ADD CONSTRAINT fk_fotografias_archivo
        FOREIGN KEY (ruta) REFERENCES archivos(ruta) ON DELETE RESTRICT;

ALTER TABLE documentos_verificacion
    ADD CONSTRAINT fk_documentos_archivo
        FOREIGN KEY (ruta_documento) REFERENCES archivos(ruta) ON DELETE RESTRICT;

-- Busqueda de referencias al limpiar huerfanos.
CREATE INDEX idx_fotografias_ruta ON fotografias(ruta);
CREATE INDEX idx_documentos_ruta ON documentos_verificacion(ruta_documento);

INSERT INTO schema_migraciones (version, nombre) VALUES ('006', 'archivos');

COMMIT;
