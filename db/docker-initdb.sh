#!/bin/bash
# Lo ejecuta la imagen postgis/postgis al crear el volumen (despues de 10_postgis.sh).
# Aplica db/migraciones/*.sql en orden sobre la base POSTGRES_DB.
set -euo pipefail
for f in /docker-entrypoint-initdb.d/migraciones/[0-9][0-9][0-9]_*.sql; do
  echo "InmobiSV: aplicando $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -X -q --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
