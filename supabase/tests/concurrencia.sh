#!/usr/bin/env bash
# T-10 · Prueba de concurrencia de reservar_cita (HU-11).
#
# Lanza N reservas del mismo hueco al mismo tiempo, cada una en su propia
# conexión y como rol anon (igual que un visitante sin cuenta). Debe ganar
# exactamente una; las demás tienen que fallar con horario_ocupado.
# Al terminar borra las citas de prueba, así se puede correr las veces que sea.
#
# Requiere la base local levantada con la semilla (supabase start; supabase db reset).
#
# Uso:
#   bash supabase/tests/concurrencia.sh [opciones]
#
# Opciones (todas tienen valor por defecto):
#   --db     URL       conexión a Postgres  (postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#   --n      NÚMERO    reservas simultáneas (20)
#   --slug   SLUG      negocio              (estetica-lupita)
#   --dia    1..7      día ISO del hueco, siempre la semana que entra (3 = miércoles)
#   --hora   HH:MM     hora local del hueco, alineada a la rejilla (11:15)

set -uo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
N=20
SLUG="estetica-lupita"
DIA=3
HORA="11:15"

while [ $# -gt 0 ]; do
  case "$1" in
    --db)   DB_URL="$2"; shift 2 ;;
    --n)    N="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --dia)  DIA="$2"; shift 2 ;;
    --hora) HORA="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1 (usa --help)"; exit 2 ;;
  esac
done

command -v psql >/dev/null 2>&1 || { echo "Falta psql (cliente de PostgreSQL)"; exit 2; }
case "$N" in ''|*[!0-9]*) echo "--n debe ser un número"; exit 2 ;; esac
case "$DIA" in [1-7]) ;; *) echo "--dia debe ir de 1 a 7"; exit 2 ;; esac
[[ "$HORA" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { echo "--hora debe ser HH:MM"; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "--slug no es válido"; exit 2; }
[ "$N" -ge 2 ] || { echo "--n debe ser al menos 2"; exit 2; }

q() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq "$@"; }

# Marca para reconocer (y luego borrar) las citas de esta corrida.
MARCA="concurrencia-$$-$(date +%s)"

# Hueco en la hora local del negocio, en la semana que entra (nunca en el pasado).
INICIO="$(q -c "
  select ((h.d + ((7 + $DIA - extract(isodow from h.d)::int) % 7) + 7) + time '$HORA')
         at time zone n.zona_horaria
  from public.negocio n,
       lateral (select (now() at time zone n.zona_horaria)::date as d) h
  where n.slug = '$SLUG'")" || exit 2
[ -n "$INICIO" ] || { echo "No existe el negocio '$SLUG' (¿corriste supabase db reset?)"; exit 2; }

limpiar() { q -c "delete from public.cita where correo_cliente like '$MARCA-%'" >/dev/null 2>&1; rm -rf "$SALIDA"; }
SALIDA="$(mktemp -d)"
trap limpiar EXIT

for i in $(seq 1 "$N"); do
  psql "$DB_URL" -X -Atq -c "set role anon" \
    -c "select cita_id from public.reservar_cita('$SLUG', '$INICIO', 'Cliente $i',
          '$MARCA-$i@correo.test', '81$(printf '%08d' "$i")')" \
    >"$SALIDA/$i.out" 2>"$SALIDA/$i.err" &
done
wait

EXITOS=$(grep -l . "$SALIDA"/*.out 2>/dev/null | wc -l | tr -d ' ')
OCUPADO=$(grep -l "horario_ocupado" "$SALIDA"/*.err 2>/dev/null | wc -l | tr -d ' ')
GUARDADAS=$(q -c "select count(*) from public.cita where correo_cliente like '$MARCA-%' and estado = 'confirmada'")

echo "Hueco: $INICIO"
echo "Reservas simultáneas: $N · exitosas: $EXITOS · rechazadas por horario_ocupado: $OCUPADO · guardadas: $GUARDADAS"

if [ "$EXITOS" -eq 1 ] && [ "$OCUPADO" -eq $((N - 1)) ] && [ "$GUARDADAS" -eq 1 ]; then
  echo "PASA: solo una persona se quedó con el hueco"
else
  echo "FALLA. Errores recibidos:"
  cat "$SALIDA"/*.err | sort | uniq -c
  exit 1
fi
