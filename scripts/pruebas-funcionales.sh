#!/usr/bin/env bash
# Pruebas funcionales F01–F22 (docs/pruebas.md) contra la API levantada.
# Uso: API=http://localhost:3000/api ADMIN_EMAIL=... ADMIN_PASSWORD=... bash scripts/pruebas-funcionales.sh
# Requiere: curl, jq. Crea usuarios con correos únicos en cada ejecución.
# Nota: login está limitado a 5/min y registro a 10/min por IP; el script espera
# entre bloques para no chocar con el rate limiting.
set -u

API="${API:-http://localhost:3000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@inmobisv.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-CambiaEstaClave123}"
SUF="$(date +%s)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
STATUS=""; BODY=""

# req MÉTODO RUTA [TOKEN] [JSON]
req() {
  local metodo="$1" ruta="$2" token="${3:-}" datos="${4:-}"
  local args=(-s -o "$TMP/body" -w '%{http_code}' -X "$metodo" "$API$ruta")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$datos" ] && args+=(-H 'Content-Type: application/json' -d "$datos")
  STATUS="$(curl "${args[@]}")"
  BODY="$(cat "$TMP/body")"
}

# subir RUTA TOKEN ARCHIVO
subir() {
  STATUS="$(curl -s -o "$TMP/body" -w '%{http_code}' -X POST "$API$1" \
    -H "Authorization: Bearer $2" -F "archivo=@$3")"
  BODY="$(cat "$TMP/body")"
}

# check ID DESCRIPCIÓN CONDICIÓN(bash) — registra el resultado
check() {
  local id="$1" desc="$2"; shift 2
  if eval "$@"; then
    PASS=$((PASS+1)); echo "OK    $id  $desc  (HTTP $STATUS)"
  else
    FAIL=$((FAIL+1)); echo "FALLA $id  $desc  (HTTP $STATUS) -> ${BODY:0:300}"
  fi
}
j() { echo "$BODY" | jq -r "$1"; }

publicacion_json() { # título operación precio departamento área url
  cat <<EOF
{"titulo":"$1","descripcion":"Terreno plano con acceso a calle pavimentada.",
 "tipoOperacion":"$2","precio":$3,
 "terreno":{"areaM2":$5,"largoM":20,"anchoM":25,"tipoTerreno":"Urbano"},
 "ubicacion":{"departamento":"$4","municipio":"Municipio Prueba","latitud":13.4833333,"longitud":-88.1833333},
 "fotografias":[{"urlImagen":"$6","esPortada":true}]}
EOF
}

# Archivos de prueba: JPG real y un PHP renombrado a .jpg
convert -size 4x4 xc:green "$TMP/foto.jpg" 2>/dev/null || printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00' > "$TMP/foto.jpg"
printf '<?php system($_GET["c"]); ?>' > "$TMP/falso.jpg"
printf '%%PDF-1.4\n%%prueba\n' > "$TMP/doc.pdf"

echo "== Auth y registro =="
CLI="cliente$SUF@prueba.sv"
req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Cliente Prueba\",\"correo\":\"$CLI\",\"password\":\"Clave12345\"}"
TOK_CLI="$(j .token)"
check F01 "Registrar cliente válido -> 201 + token" '[ "$STATUS" = 201 ] && [ "$TOK_CLI" != null ]'

req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Otro\",\"correo\":\"$CLI\",\"password\":\"Clave12345\"}"
check F02 "Correo repetido -> 409" '[ "$STATUS" = 409 ]'

req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Debil\",\"correo\":\"debil$SUF@prueba.sv\",\"password\":\"abc\"}"
check F03a "Contraseña débil -> 400" '[ "$STATUS" = 400 ]'
req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Extra\",\"correo\":\"extra$SUF@prueba.sv\",\"password\":\"Clave12345\",\"rol\":\"ADMIN\"}"
check F03b "Campo extra (rol) -> 400" '[ "$STATUS" = 400 ]'

req POST /auth/login "" "{\"correo\":\"$CLI\",\"password\":\"Clave12345\"}"
check F04a "Login correcto -> 200" '[ "$STATUS" = 200 ]'
req POST /auth/login "" "{\"correo\":\"$CLI\",\"password\":\"Incorrecta1\"}"
check F04b "Login incorrecto -> 401" '[ "$STATUS" = 401 ]'

req POST /auth/login "" "{\"correo\":\"$CLI\",\"password\":\"Clave12345\"}"
TOK_TMP="$(j .token)"
req POST /auth/logout "$TOK_TMP"; S1="$STATUS"
req GET /auth/me "$TOK_TMP"
check F05 "Logout ($S1) y reutilizar token -> 401" '[ "$S1" = 204 ] && [ "$STATUS" = 401 ]'

VEN="vendedor$SUF@prueba.sv"
req POST /auth/registro/vendedor "" "{\"nombreCompleto\":\"Vendedor Prueba\",\"correo\":\"$VEN\",\"password\":\"Clave12345\",\"telefono\":\"7123-4567\",\"dui\":\"${SUF:2:8}-1\"}"
TOK_VEN="$(j .token)"
check F06 "Registrar vendedor -> 201, rol VENDEDOR" '[ "$STATUS" = 201 ] && [ "$(j .usuario.rol)" = VENDEDOR ]'

VEN2="vendedor2$SUF@prueba.sv"
req POST /auth/registro/vendedor "" "{\"nombreCompleto\":\"Vendedor Dos\",\"correo\":\"$VEN2\",\"password\":\"Clave12345\",\"telefono\":\"7765-4321\",\"dui\":\"${SUF:2:8}-2\"}"
TOK_VEN2="$(j .token)"

echo "== P03 cambio de rol =="
# Cliente sin teléfono: no cumple requisitos aunque envíe DUI válido
req POST /cambio-rol/solicitudes "$TOK_CLI" "{\"dui\":\"${SUF:2:8}-3\"}"
check F07a "Cliente sin teléfono/WhatsApp -> 422 con requisitosPendientes" \
  '[ "$STATUS" = 422 ] && [ "$(j ".details.requisitosPendientes | length")" -gt 0 ]'
req POST /cambio-rol/solicitudes "$TOK_CLI" "{}"
check F07b "Cliente sin DUI -> 422 con requisitosPendientes" \
  '[ "$STATUS" = 422 ] && [ "$(j ".details.requisitosPendientes | length")" -gt 0 ]'

req POST /cambio-rol/solicitudes "$TOK_CLI" "{\"dui\":\"${SUF:2:8}-3\",\"telefono\":\"7333-4444\"}"; S1="$STATUS"
req GET /auth/me "$TOK_CLI"
check F07c "Cliente sin teléfono lo completa en la solicitud ($S1) -> VENDEDOR" '[ "$S1" = 201 ] && [ "$(j .rol)" = VENDEDOR ]'
# El cliente de F01 sigue siendo usado como comprador en F10, F12, F18–F21: se usa uno nuevo
req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Cliente Comprador\",\"correo\":\"comprador$SUF@prueba.sv\",\"password\":\"Clave12345\"}"
TOK_CLI="$(j .token)"

CLI2="cliente2$SUF@prueba.sv"
req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Cliente Completo\",\"correo\":\"$CLI2\",\"password\":\"Clave12345\",\"telefono\":\"7222-3333\"}"
TOK_CLI2="$(j .token)"
req POST /cambio-rol/solicitudes "$TOK_CLI2" "{\"dui\":\"${SUF:2:8}-4\",\"numeroWhatsapp\":\"7222-3333\"}"
S1="$STATUS"
req GET /auth/me "$TOK_CLI2"
check F08 "Cliente con requisitos completos ($S1) -> rol VENDEDOR" '[ "$S1" = 201 ] && [ "$(j .rol)" = VENDEDOR ]'

echo "== P04/P05/P06/P07 publicaciones =="
subir /archivos/imagenes "$TOK_VEN" "$TMP/foto.jpg"; S1="$STATUS"; URL="$(j .url)"
subir /archivos/imagenes "$TOK_VEN" "$TMP/falso.jpg"
check F13 "Subir JPG real ($S1) / PHP renombrado -> 201 / 422 (rechazado por firma)" '[ "$S1" = 201 ] && [ "$STATUS" = 422 ]'

req POST /publicaciones "$TOK_VEN" "$(publicacion_json "Terreno en San Miguel $SUF" VENTA 25000 "San Miguel" 500 "$URL")"
PUB1="$(j .idPublicacion)"
check F09 "Vendedor crea publicación -> 201, estado definido" '[ "$STATUS" = 201 ] && [ "$(j .estado)" != null ]'
req POST /publicaciones "$TOK_VEN" "$(publicacion_json "Terreno en Usulután $SUF" VENTA 40000 "Usulután" 1000 "$URL")"
PUB2="$(j .idPublicacion)"
req POST /publicaciones "$TOK_VEN2" "$(publicacion_json "Terreno en La Unión $SUF" VENTA 15000 "La Unión" 300 "$URL")"
PUB3="$(j .idPublicacion)"
req POST /publicaciones "$TOK_VEN2" "$(publicacion_json "Terreno renta Morazán $SUF" RENTA 300 "Morazán" 800 "$URL")"
PUB4="$(j .idPublicacion)"
req POST /publicaciones "$TOK_VEN2" "$(publicacion_json "Terreno en San Miguel B $SUF" VENTA 18000 "San Miguel" 450 "$URL")"
PUB5="$(j .idPublicacion)"

req POST /publicaciones "$TOK_CLI" "$(publicacion_json "Intento cliente $SUF" VENTA 1000 "San Miguel" 100 "$URL")"
check F10 "Cliente intenta crear -> 403" '[ "$STATUS" = 403 ]'

req PATCH "/publicaciones/$PUB1" "$TOK_VEN2" '{"titulo":"Edición ajena maliciosa"}'
check F11 "Editar publicación ajena -> 403" '[ "$STATUS" = 403 ]'

# Favorito antes de bajar el precio para comprobar la notificación
req POST "/favoritos/$PUB1/alternar" "$TOK_CLI"
req PATCH "/publicaciones/$PUB1/precio" "$TOK_VEN" '{"precio":22000}'; S1="$STATUS"
req GET "/publicaciones/$PUB1/historial-precios" "$TOK_VEN"; HIST="$BODY"
req GET /notificaciones "$TOK_CLI"; NOTIF="$BODY"
check F12 "Cambiar precio ($S1): historial + notificación al favorito" \
  '[ "$S1" = 200 ] && echo "$HIST" | grep -q 22000 && echo "$NOTIF" | grep -qi "$PUB1"'

FOTOS="$(for i in $(seq 1 20); do printf '{"urlImagen":"%s"},' "$URL"; done | sed 's/,$//')"
req POST "/publicaciones/$PUB2/fotografias" "$TOK_VEN" "{\"fotografias\":[$FOTOS]}"
check F14 "Superar 20 fotografías (1 + 20) -> 422" '[ "$STATUS" = 422 ]'

echo "== P08 listado =="
req GET "/publicaciones?departamento=San%20Miguel&precioMin=10000&precioMax=30000&areaMin=100&orden=PRECIO_ASC&page=1&limit=1"
check F15 "Filtrar depto/precio/área/orden + paginación" \
  '[ "$STATUS" = 200 ] && [ "$(echo "$BODY" | jq "[.. | objects | select(has(\"departamento\")) | .departamento] | all(. == \"San Miguel\")")" = true ] && echo "$BODY" | jq -e ".total // .meta.total // .totalItems" >/dev/null'
echo "      respuesta F15: $(echo "$BODY" | jq -c '{keys: keys}')"

req GET "/publicaciones/$PUB1"
LAT_PUB="$(j .ubicacion.latitud)"; EXACTA_PUB="$(j '.ubicacion.latitudExacta // "ausente"')"
req GET "/publicaciones/$PUB1" "$TOK_VEN"
LAT_DUE="$(j .ubicacion.latitudExacta)"
check F16 "Anónimo ve $LAT_PUB (exacta: $EXACTA_PUB); dueño ve exacta $LAT_DUE" \
  '[ "$EXACTA_PUB" = ausente ] && [ "$LAT_DUE" != "$LAT_PUB" ] && [ "$(echo "$LAT_PUB" | cut -d. -f2 | wc -c)" -le 3 ]'

echo "== P09 estados =="
req POST "/publicaciones/$PUB2/pausar" "$TOK_VEN"; A="$STATUS"
req POST "/publicaciones/$PUB2/reactivar" "$TOK_VEN"; B="$STATUS"
req POST "/publicaciones/$PUB2/marcar-vendida" "$TOK_VEN"; C="$STATUS"
req POST "/publicaciones/$PUB2/reactivar" "$TOK_VEN"; D="$STATUS"
req POST "/publicaciones/$PUB2/marcar-rentada" "$TOK_VEN"; E="$STATUS"
check F17 "Pausar $A / reactivar $B / vendida $C; reactivar vendida $D y rentar venta $E -> 422" \
  '[ "$A" = 200 ] && [ "$B" = 200 ] && [ "$C" = 200 ] && [ "$D" = 422 ] && [ "$E" = 422 ]'

echo "== P10 favoritos =="
req POST "/favoritos/$PUB3/alternar" "$TOK_CLI"; A="$(j -c . 2>/dev/null || echo "$BODY")"
req GET /favoritos "$TOK_CLI"; L1="$BODY"
req POST "/favoritos/$PUB3/alternar" "$TOK_CLI"
req GET /favoritos "$TOK_CLI"; L2="$BODY"
check F18 "Alternar favorito agrega y luego quita" \
  'echo "$L1" | grep -q "\"idPublicacion\":$PUB3" && ! echo "$L2" | grep -q "\"idPublicacion\":$PUB3"'

echo "== P11 WhatsApp =="
req GET "/publicaciones/$PUB1/whatsapp"; S1="$STATUS"
req GET "/publicaciones/$PUB1/whatsapp" "$TOK_CLI"
check F19 "WhatsApp sin sesión $S1 / con sesión -> 401 / wa.me" '[ "$S1" = 401 ] && [ "$STATUS" = 200 ] && echo "$BODY" | grep -q "wa.me"'

echo "== P12 comparación =="
req POST /comparaciones "$TOK_CLI" "{\"idsPublicaciones\":[$PUB1,$PUB3,$PUB5]}"
check F20 "Comparar 3 terrenos de venta -> tabla con precio/m² y resumen" \
  '[ "$STATUS" = 201 ] && echo "$BODY" | grep -qi "precioPorM2\|precioM2" && [ "$(j .resumen)" != null ]'
req POST /comparaciones "$TOK_CLI" "{\"idsPublicaciones\":[$PUB1]}"; A="$STATUS"
req POST /comparaciones "$TOK_CLI" "{\"idsPublicaciones\":[$PUB1,$PUB3,$PUB5,$PUB4,$PUB2]}"; B="$STATUS"
req POST /comparaciones "$TOK_CLI" "{\"idsPublicaciones\":[$PUB1,$PUB4]}"; C="$STATUS"
check F21 "Comparar 1 ($A), 5 ($B), venta vs renta ($C) -> 422" '[ "$A" = 422 ] && [ "$B" = 422 ] && [ "$C" = 422 ]'

echo "== Verificación de vendedor =="
subir /archivos/documentos "$TOK_VEN" "$TMP/doc.pdf"; RUTA="$(j .ruta)"
req POST /vendedores/me/documentos "$TOK_VEN" "{\"tipoDocumento\":\"DUI_FRENTE\",\"rutaDocumento\":\"$RUTA\"}"; S1="$STATUS"; DOC="$(j ".documento.idDocumento // .idDocumento")"
req POST /auth/login "" "{\"correo\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"; TOK_ADM="$(j .token)"
req PATCH "/admin/documentos/$DOC/revision" "$TOK_ADM" '{"estado":"APROBADO"}'; S2="$STATUS"
req GET /vendedores/me/documentos "$TOK_VEN"
check F22 "Documento enviado ($S1), aprobado ($S2) -> VERIFICADO" '[ "$S1" = 201 ] && [ "$S2" = 200 ] && echo "$BODY" | grep -q VERIFICADO'

echo
echo "Resultado: $PASS aprobadas, $FAIL fallidas ($(date -u +%Y-%m-%dT%H:%MZ))"
[ "$FAIL" = 0 ]
