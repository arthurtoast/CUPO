-- HU-13 · Cancelar con el enlace del correo
--
-- El cliente no tiene cuenta: lo único que prueba que la cita es suya es el token
-- de 32 bytes aleatorios que recibió en su correo (HU-12) y en su pantalla de
-- confirmación. Quien tenga el enlace puede ver un resumen de esa cita y cancelarla,
-- y nada más: no puede listar otras citas ni ver datos de otros clientes.
--
-- Dos funciones, las dos security definer (el rol anon no tiene permisos sobre la
-- tabla cita) y con search_path vacío, como reservar_cita (T-05):
--
--   cita_por_token(token)      resumen de la cita para mostrarlo antes de confirmar
--   cancelar_por_token(token)  la pasa a cancelada; el horario vuelve a quedar libre
--
-- Errores de cancelar_por_token (el mensaje es un código estable, SQLSTATE P0001):
--
--   token_invalido      el token no tiene el formato o no corresponde a ninguna cita
--   cita_ya_cancelada   ya estaba cancelada; no cambia nada
--   cita_pasada         la cita ya empezó o ya pasó; no se puede cancelar
--
-- La cita no se borra (regla de integridad 4): cambia estado y cancelada_en, y el
-- negocio la sigue viendo en su agenda como cancelada. El horario se libera solo,
-- porque la restricción cita_sin_traslape y la vista vista_ocupado solo cuentan las
-- citas confirmadas.

-- Formato del token: 64 caracteres hexadecimales en minúscula (encode(..., 'hex')).
-- Se revisa antes de buscar para no gastar una consulta en basura.
create or replace function public.cupo_token_valido(p_token text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_token ~ '^[0-9a-f]{64}$', false)
$$;

comment on function public.cupo_token_valido(text) is
  'true si el texto tiene la forma de un token de cancelación (64 hexadecimales).';

-- ---------------------------------------------------------------------------
-- cita_por_token: lo que ve el cliente en la página de cancelación
--
-- Regresa cero filas si el token no existe o no tiene formato; así la página no
-- distingue "token mal escrito" de "token de otra persona" (no da pistas).
-- No regresa el correo ni el teléfono del cliente, ni el token, ni el motivo de
-- bloqueos: solo lo necesario para que reconozca su cita.
-- ---------------------------------------------------------------------------
create or replace function public.cita_por_token(p_token text)
returns table (
  estado            text,
  inicio            timestamptz,
  fin               timestamptz,
  cancelada_en      timestamptz,
  nombre_cliente    text,
  servicio_nombre   text,
  negocio_nombre    text,
  negocio_slug      text,
  zona_horaria      text,
  telefono_publico  text,
  direccion         text,
  color_acento      text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.estado, c.inicio, c.fin, c.cancelada_en, c.nombre_cliente,
         s.nombre, n.nombre, n.slug, n.zona_horaria, n.telefono_publico,
         n.direccion, n.color_acento
  from public.cita c
  join public.negocio n on n.id = c.negocio_id
  join public.servicio s on s.id = c.servicio_id
  where public.cupo_token_valido(p_token)
    and c.token_cancelacion = p_token
$$;

comment on function public.cita_por_token(text) is
  'Resumen de una cita a partir de su token de cancelación. Cero filas si no existe.';

-- ---------------------------------------------------------------------------
-- cancelar_por_token: la única puerta para que el cliente cancele
--
-- "for update" bloquea la fila: si el cliente da dos clics o abre el enlace en dos
-- pestañas, la segunda llamada espera a la primera y ve la cita ya cancelada, en
-- vez de cancelarla dos veces. El trigger cita_transicion_estado (T-04) llena
-- cancelada_en y además impide reactivarla.
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_por_token(p_token text)
returns table (cita_id uuid, estado text, inicio timestamptz, cancelada_en timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita public.cita%rowtype;
begin
  if not public.cupo_token_valido(p_token) then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;

  select * into v_cita
  from public.cita c
  where c.token_cancelacion = p_token
  for update;

  if not found then
    raise exception 'token_invalido' using errcode = 'P0001';
  end if;
  if v_cita.estado = 'cancelada' then
    raise exception 'cita_ya_cancelada' using errcode = 'P0001';
  end if;
  if v_cita.inicio <= pg_catalog.now() then
    raise exception 'cita_pasada' using errcode = 'P0001',
      hint = 'La cita ya empezó o ya pasó; para cambios hay que hablar con el negocio.';
  end if;

  update public.cita c
     set estado = 'cancelada'
   where c.id = v_cita.id
  returning * into v_cita;

  return query select v_cita.id, v_cita.estado, v_cita.inicio, v_cita.cancelada_en;
end;
$$;

comment on function public.cancelar_por_token(text) is
  'Cancela la cita del token. Errores: token_invalido, cita_ya_cancelada, cita_pasada.';

revoke execute on function public.cupo_token_valido(text) from public;
revoke execute on function public.cita_por_token(text) from public;
revoke execute on function public.cancelar_por_token(text) from public;
grant  execute on function public.cupo_token_valido(text) to anon, authenticated;
grant  execute on function public.cita_por_token(text) to anon, authenticated;
grant  execute on function public.cancelar_por_token(text) to anon, authenticated;
