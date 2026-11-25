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

publicacion_json() { # título operación precio departamento área url [lat] [lng]
  local lat="${7:-13.4833333}" lng="${8:--88.1833333}"
  cat <<EOF
{"titulo":"$1","descripcion":"Terreno plano con acceso a calle pavimentada.",
 "tipoOperacion":"$2","precio":$3,
 "terreno":{"areaM2":$5,"largoM":20,"anchoM":25,"tipoTerreno":"Urbano"},
 "ubicacion":{"departamento":"$4","municipio":"Municipio Prueba","latitud":$lat,"longitud":$lng},
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

# Sesión desechable obtenida por registro (el límite de login es de 5/min y se usa más adelante)
req POST /auth/registro/cliente "" "{\"nombreCompleto\":\"Sesion Temporal\",\"correo\":\"temp$SUF@prueba.sv\",\"password\":\"Clave12345\"}"
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

echo "== Fase 2: perfil propio y baja de precio atómica =="
req PATCH /auth/me "$TOK_CLI" '{"nombreCompleto":"Comprador Editado","telefono":"7555-6666"}'
check F23 "PATCH /auth/me cambia nombre y teléfono -> 200" '[ "$STATUS" = 200 ] && [ "$(j .nombreCompleto)" = "Comprador Editado" ] && [ "$(j .telefono)" = 75556666 ]'
req PATCH /auth/me "$TOK_CLI" '{"rol":"ADMIN"}'; A="$STATUS"
req PATCH /auth/me "$TOK_CLI" '{"telefono":"123"}'; B="$STATUS"
req PATCH /auth/me "" '{"nombreCompleto":"Nadie"}'; C="$STATUS"
check F24 "Perfil: campo rol ($A) / teléfono inválido ($B) / sin sesión ($C) -> 400/422/401" '[ "$A" = 400 ] && [ "$B" = 422 ] && [ "$C" = 401 ]'

req POST "/favoritos/$PUB5/alternar" "$TOK_CLI"
req PATCH "/publicaciones/$PUB5/precio" "$TOK_VEN2" '{"precio":17000}'; A="$STATUS"; NA="$(j .clientesNotificados)"
req PATCH "/publicaciones/$PUB5/precio" "$TOK_VEN2" '{"precio":16000}'; B="$STATUS"; NB="$(j .clientesNotificados)"
req GET /notificaciones "$TOK_CLI"
N_AVISOS="$(echo "$BODY" | jq "[.. | objects | select(.tipo? == \"BAJA_PRECIO\" and .idPublicacion? == $PUB5)] | length")"
check F48 "Dos bajas seguidas ($A/$B, avisos $NA+$NB) -> una notificación por baja, sin duplicados ($N_AVISOS)" \
  '[ "$A" = 200 ] && [ "$B" = 200 ] && [ "$NA" = 1 ] && [ "$NB" = 1 ] && [ "$N_AVISOS" = 2 ]'

echo "== Fase 2: sesión por cookie HttpOnly + CSRF =="
JAR="$TMP/cookies.txt"
# ck MÉTODO RUTA [JSON] [cabeceras extra...] — petición del "navegador" con la cookie jar
ck() {
  local metodo="$1" ruta="$2" datos="${3:-}"; shift 3 2>/dev/null || shift $#
  local args=(-s -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' -b "$JAR" -c "$JAR" -X "$metodo" "$API$ruta" "$@")
  [ -n "$datos" ] && args+=(-H 'Content-Type: application/json' -d "$datos")
  STATUS="$(curl "${args[@]}")"; BODY="$(cat "$TMP/body")"
}
ck POST /auth/login "{\"correo\":\"$CLI2\",\"password\":\"Clave12345\"}"
SETCK="$(grep -i '^set-cookie: inmobisv_sesion=' "$TMP/headers")"; CSRF="$(j .csrfToken)"; S1="$STATUS"
ck GET /auth/me ""
check F49 "Login con cookie ($S1): Set-Cookie HttpOnly y /auth/me con la cookie -> 200" \
  '[ "$S1" = 200 ] && echo "$SETCK" | grep -qi httponly && echo "$SETCK" | grep -qi "path=/api" && [ "$STATUS" = 200 ]'

ck PATCH /auth/me '{"nombreCompleto":"Con Cookie"}'; A="$STATUS"
ck PATCH /auth/me '{"nombreCompleto":"Con Cookie"}' -H "X-CSRF-Token: falso"; B="$STATUS"
ck GET /auth/csrf ""; CSRF2="$(j .csrfToken)"
ck PATCH /auth/me '{"nombreCompleto":"Con Cookie"}' -H "X-CSRF-Token: $CSRF2"; C="$STATUS"
check F50 "Cookie sin token ($A) / token falso ($B) / token de /auth/csrf ($C) -> 403/403/200" \
  '[ "$A" = 403 ] && [ "$B" = 403 ] && [ "$C" = 200 ] && [ "$CSRF2" = "$CSRF" ]'

req PATCH /auth/me "$TOK_CLI2" '{"nombreCompleto":"Con Bearer"}'
check F51 "Bearer sin cabecera CSRF -> 200" '[ "$STATUS" = 200 ]'

ck PATCH /auth/me '{"nombreCompleto":"Ataque"}' -H "X-CSRF-Token: $CSRF" -H "Origin: https://evil.example"
check F52 "Cookie + token válido pero Origin ajeno -> 403" '[ "$STATUS" = 403 ]'

PRE_MALO="$(curl -s -D - -o /dev/null -X OPTIONS "$API/auth/me" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: PATCH' | grep -ci '^access-control-allow-origin')"
PRE_OK="$(curl -s -D - -o /dev/null -X OPTIONS "$API/auth/me" -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: PATCH' -H 'Access-Control-Request-Headers: x-csrf-token')"
check F53 "Preflight CORS: origen ajeno sin Allow-Origin ($PRE_MALO); permitido con credentials" \
  '[ "$PRE_MALO" = 0 ] && echo "$PRE_OK" | grep -qi "access-control-allow-credentials: true" && echo "$PRE_OK" | grep -qi "x-csrf-token"'

cp "$JAR" "$TMP/cookies-viejas.txt"
ck POST /auth/logout "" -H "X-CSRF-Token: $CSRF"; A="$STATUS"; BORRA="$(grep -i '^set-cookie: inmobisv_sesion=;' "$TMP/headers")"
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/cookies-viejas.txt" "$API/auth/me")"
check F54 "Logout por cookie ($A) borra la cookie y la cookie vieja da 401" '[ "$A" = 204 ] && [ -n "$BORRA" ] && [ "$STATUS" = 401 ]'

echo "== Fase 2: PostGIS y búsqueda por cercanía =="
# Publicación lejana: San Salvador (~110 km de San Miguel, donde están las demás)
req POST /publicaciones "$TOK_VEN" "$(publicacion_json "Terreno en San Salvador $SUF" VENTA 50000 "San Salvador" 600 "$URL" 13.6929403 -89.2181911)"
PUB_LEJOS="$(j .idPublicacion)"
req GET "/publicaciones?lat=13.48&lng=-88.18&radioKm=5&limit=50"
IDS="$(echo "$BODY" | jq -c '[.items[].idPublicacion]')"
check F41 "Radio 5 km desde San Miguel: incluye PUB1, excluye la de San Salvador; distanciaKm ≤ 5; sin exactas; ≤2 decimales" \
  '[ "$STATUS" = 200 ] && echo "$IDS" | jq -e "index($PUB1) != null and index($PUB_LEJOS) == null" >/dev/null && echo "$BODY" | jq -e "all(.items[]; .distanciaKm <= 5 and .latitud != null and (has(\"latitudExacta\") | not) and ((.latitud * 100 | . == floor)))" >/dev/null'
req GET "/publicaciones?lat=13.69&lng=-89.21&radioKm=5&limit=50"
check F41b "Radio 5 km desde San Salvador: aparece la de San Salvador y no PUB1" \
  'echo "$BODY" | jq -e "[.items[].idPublicacion] | index($PUB_LEJOS) != null and index($PUB1) == null" >/dev/null'
req GET "/publicaciones?lat=13.48&lng=-88.18&radioKm=50&precioMax=20000&tipoOperacion=VENTA&limit=50"
check F42 "Radio combinado con precioMax y tipoOperacion: todas cumplen" \
  '[ "$STATUS" = 200 ] && [ "$(j .total)" -gt 0 ] && echo "$BODY" | jq -e "all(.items[]; .precio <= 20000 and .tipoOperacion == \"VENTA\" and .distanciaKm <= 50)" >/dev/null'
# Publicación intermedia en Usulután (~30 km de San Miguel) para que el orden no sea trivial
req POST /publicaciones "$TOK_VEN" "$(publicacion_json "Terreno en Usulután centro $SUF" VENTA 12000 "Usulután" 400 "$URL" 13.3500000 -88.4400000)"
PUB_MEDIO="$(j .idPublicacion)"
req GET "/publicaciones?lat=13.48&lng=-88.18&radioKm=50&orden=DISTANCIA&q=$SUF&limit=50"
check F43 "orden=DISTANCIA: ascendente; la de Usulután (~30 km) va después de las de San Miguel" \
  'echo "$BODY" | jq -e "[.items[].distanciaKm] as \$d | \$d == (\$d | sort) and \$d[0] < 2 and (.items | map(.idPublicacion) | index($PUB_MEDIO)) == (.items | length - 1) and .items[-1].distanciaKm > 25" >/dev/null'
req GET "/publicaciones?lat=13.48&lng=-88.18&radioKm=100"; A="$STATUS"
req GET "/publicaciones?lat=13.48"; B="$STATUS"
req GET "/publicaciones?orden=DISTANCIA"; C="$STATUS"
check F44 "radioKm=100 ($A), solo lat ($B), DISTANCIA sin centro ($C) -> 400" '[ "$A" = 400 ] && [ "$B" = 400 ] && [ "$C" = 400 ]'
req GET /health
check F55 "GET /health incluye la versión de PostGIS y el esquema" '[ "$STATUS" = 200 ] && [ "$(j .postgis)" != null ] && echo "$BODY" | jq -e ".esquema | index(\"002\") != null" >/dev/null'

echo "== Fase 2: administración (usuarios, moderación, auditoría) =="
req GET /admin/usuarios "$TOK_CLI"; A="$STATUS"
req GET /admin/auditoria "$TOK_VEN"; B="$STATUS"
req PATCH "/admin/publicaciones/$PUB3/moderacion" "$TOK_VEN" '{"accion":"RECHAZAR","motivo":"x"}'; C="$STATUS"
check F25 "Cliente/vendedor en /admin/usuarios ($A), /admin/auditoria ($B), moderación ($C) -> 403" '[ "$A" = 403 ] && [ "$B" = 403 ] && [ "$C" = 403 ]'

req GET "/admin/usuarios?rol=VENDEDOR&limit=5" "$TOK_ADM"
check F26 "Admin lista usuarios filtrando rol=VENDEDOR, paginado" \
  '[ "$STATUS" = 200 ] && echo "$BODY" | jq -e "(.items | length) <= 5 and all(.items[]; .rol == \"VENDEDOR\") and .totalPages >= 1 and (.items[0] | has(\"passwordHash\") | not)" >/dev/null'

req GET "/admin/usuarios?q=$VEN2" "$TOK_ADM"; ID_VEN2="$(j '.items[0].idUsuario')"
req GET "/admin/auditoria?accion=USUARIO_BLOQUEADO&entidad=USUARIO&idEntidad=$ID_VEN2" "$TOK_ADM"; AUD_ANTES="$(j .total)"
req PATCH "/admin/usuarios/$ID_VEN2/estado" "$TOK_ADM" '{"estado":"BLOQUEADA","motivo":"Publicaciones engañosas"}'; A="$STATUS"; CERRADAS="$(j .sesionesCerradas)"
req GET /auth/me "$TOK_VEN2"; B="$STATUS"
req POST /auth/login "" "{\"correo\":\"$VEN2\",\"password\":\"Clave12345\"}"; C="$STATUS"
check F27 "Bloquear vendedor 2 ($A, sesiones cerradas $CERRADAS): su token ($B) y su login ($C) -> 200/401/403" \
  '[ "$A" = 200 ] && [ "$CERRADAS" -ge 1 ] && [ "$B" = 401 ] && [ "$C" = 403 ]'

req PATCH "/admin/usuarios/$ID_VEN2/estado" "$TOK_ADM" '{"estado":"BLOQUEADA","motivo":"Publicaciones engañosas"}'; A="$STATUS"; HUBO="$(j .huboCambio)"
req GET "/admin/auditoria?accion=USUARIO_BLOQUEADO&entidad=USUARIO&idEntidad=$ID_VEN2" "$TOK_ADM"; AUD_DESPUES="$(j .total)"
check F28 "Bloquear otra vez ($A, huboCambio=$HUBO): auditoría $AUD_ANTES -> $AUD_DESPUES (solo +1)" \
  '[ "$A" = 200 ] && [ "$HUBO" = false ] && [ "$AUD_DESPUES" = $((AUD_ANTES + 1)) ]'

req GET /auth/me "$TOK_ADM"; ID_ADM="$(j .idUsuario)"
req PATCH "/admin/usuarios/$ID_ADM/estado" "$TOK_ADM" '{"estado":"BLOQUEADA","motivo":"prueba"}'; A="$STATUS"
req GET "/admin/usuarios?q=$CLI2" "$TOK_ADM"; ID_CLI2="$(j '.items[0].idUsuario')"
req PATCH "/admin/usuarios/$ID_CLI2/estado" "$TOK_ADM" '{"estado":"BLOQUEADA"}'; B="$STATUS"
check F29 "Admin se bloquea a sí mismo ($A); bloqueo sin motivo ($B) -> 403/422" '[ "$A" = 403 ] && [ "$B" = 422 ]'

req GET "/publicaciones?limit=50&q=$SUF"; L1="$(echo "$BODY" | jq -c '[.items[].idPublicacion]')"
req GET "/publicaciones?lat=13.48&lng=-88.18&radioKm=50&limit=50&q=$SUF"; L2="$(echo "$BODY" | jq -c '[.items[].idPublicacion]')"
req GET "/publicaciones/$PUB3"; A="$STATUS"
req GET "/publicaciones/$PUB3" "$TOK_ADM"; B="$STATUS"
check F30 "Publicaciones del bloqueado: fuera del listado y de la búsqueda por radio; detalle anónimo $A, admin $B" \
  'echo "$L1 $L2" | jq -se "all(.[]; index($PUB3) == null and index($PUB5) == null)" >/dev/null && [ "$A" = 404 ] && [ "$B" = 200 ]'

req PATCH "/admin/usuarios/$ID_VEN2/estado" "$TOK_ADM" '{"estado":"ACTIVA"}'; A="$STATUS"
req GET "/publicaciones/$PUB3"; B="$STATUS"
req GET "/publicaciones?limit=50&q=$SUF"
check F31 "Reactivar vendedor 2 ($A): sus publicaciones reaparecen (detalle $B)" \
  '[ "$A" = 200 ] && [ "$B" = 200 ] && echo "$BODY" | jq -e "[.items[].idPublicacion] | index($PUB3) != null" >/dev/null'

req PATCH "/admin/publicaciones/$PUB1/moderacion" "$TOK_ADM" '{"accion":"RECHAZAR"}'; A="$STATUS"
req PATCH "/admin/publicaciones/$PUB1/moderacion" "$TOK_ADM" '{"accion":"RECHAZAR","motivo":"Las fotos no corresponden al terreno"}'; B="$STATUS"; EST="$(j .estado)"
check F32 "Rechazar sin motivo ($A) / con motivo ($B, $EST) -> 422/200 RECHAZADA" '[ "$A" = 422 ] && [ "$B" = 200 ] && [ "$EST" = RECHAZADA ]'

req GET "/publicaciones?limit=50&q=$SUF"; L1="$(echo "$BODY" | jq -c '[.items[].idPublicacion]')"
req GET "/publicaciones/$PUB1"; A="$STATUS"
req GET "/publicaciones/$PUB1" "$TOK_VEN"; MOTIVO="$(j .motivoRechazo)"
req POST "/publicaciones/$PUB1/reactivar" "$TOK_VEN"; C="$STATUS"
check F33 "Rechazada: fuera del listado, detalle anónimo $A, el vendedor ve el motivo y no puede reactivarla ($C)" \
  'echo "$L1" | jq -e "index($PUB1) == null" >/dev/null && [ "$A" = 404 ] && [ "$MOTIVO" = "Las fotos no corresponden al terreno" ] && [ "$C" = 422 ]'

req PATCH "/admin/publicaciones/$PUB4/moderacion" "$TOK_CLI" '{"accion":"RECHAZAR","motivo":"x"}'; A="$STATUS"
req PATCH "/admin/publicaciones/$PUB4/moderacion" "$TOK_VEN" '{"accion":"RECHAZAR","motivo":"x"}'; B="$STATUS"
check F34 "Cliente ($A) y vendedor ($B) intentan moderar -> 403" '[ "$A" = 403 ] && [ "$B" = 403 ]'

req PATCH "/admin/publicaciones/$PUB1/moderacion" "$TOK_ADM" '{"accion":"RESTAURAR"}'; A="$STATUS"; EST="$(j .estado)"
req PATCH "/admin/publicaciones/$PUB4/moderacion" "$TOK_ADM" '{"accion":"RESTAURAR"}'; B="$STATUS"
req PATCH "/admin/publicaciones/$PUB2/moderacion" "$TOK_ADM" '{"accion":"RECHAZAR","motivo":"x"}'; C="$STATUS"
check F35 "Restaurar rechazada ($A, $EST); restaurar no rechazada ($B); rechazar vendida ($C) -> 200 PAUSADA/422/422" \
  '[ "$A" = 200 ] && [ "$EST" = PAUSADA ] && [ "$B" = 422 ] && [ "$C" = 422 ]'

req GET /notificaciones "$TOK_VEN"
check F36 "El vendedor recibe la notificación de rechazo con el motivo" \
  'echo "$BODY" | jq -e "[.. | objects | select(.tipo? == \"PUBLICACION_RECHAZADA\" and .idPublicacion? == $PUB1 and (.mensaje | contains(\"Las fotos no corresponden\")))] | length >= 1" >/dev/null'

req GET "/admin/auditoria?limit=50" "$TOK_ADM"; TODAS="$BODY"
req GET "/admin/auditoria?entidad=PUBLICACION&idEntidad=$PUB1" "$TOK_ADM"; PUBS="$BODY"
req GET "/admin/auditoria?desde=2030-01-01&hasta=2020-01-01" "$TOK_ADM"; A="$STATUS"
req GET "/admin/auditoria?desde=no-es-fecha" "$TOK_ADM"; B="$STATUS"
check F37 "Auditoría: bloqueo, activación, rechazo, restauración y aprobación con actor admin; filtros; fechas ($A/$B)" \
  'echo "$TODAS" | jq -e "[.items[].accion] as \$a | ([\"USUARIO_BLOQUEADO\",\"USUARIO_ACTIVADO\",\"PUBLICACION_RECHAZADA\",\"PUBLICACION_RESTAURADA\",\"DOCUMENTO_APROBADO\"] - \$a | length) == 0 and all(.items[]; .actor.idUsuario == $ID_ADM)" >/dev/null && echo "$PUBS" | jq -e ".total == 2 and all(.items[]; .idEntidad == $PUB1)" >/dev/null && [ "$A" = 422 ] && [ "$B" = 400 ]'

echo
echo "Resultado: $PASS aprobadas, $FAIL fallidas ($(date -u +%Y-%m-%dT%H:%MZ))"
[ "$FAIL" = 0 ]
