-- HU-05 · Bloqueos: el negocio cierra fechas u horas específicas
--
-- La tabla bloqueo existe desde T-03 y la página pública ya la descuenta
-- (vista_ocupado, HU-09). Aquí se agrega cómo crearlos desde el panel:
--
--   * Días completos: "del 2 al 6 de noviembre" → un solo bloqueo que va de las
--     00:00 del primer día a las 00:00 del día siguiente al último, en la zona
--     horaria del negocio.
--   * Franja diaria: "de 14:00 a 15:00, del 2 al 6 de noviembre" → un bloqueo por
--     día, solo en esa franja. Los de una misma franja comparten `serie`, para
--     mostrarlos juntos y poder quitarlos de una vez.
--
-- La conversión de fecha y hora local a instante (timestamptz) se hace aquí y no
-- en la app, con la zona del negocio, para que el cambio de horario de verano se
-- resuelva igual que en reservar_cita.

alter table public.bloqueo add column serie uuid;

comment on column public.bloqueo.serie is
  'Agrupa los bloqueos de una franja diaria creados juntos; null si es un bloqueo suelto.';

create index bloqueo_negocio_fin_idx on public.bloqueo (negocio_id, fin);

-- ---------------------------------------------------------------------------
-- crear_bloqueos: la puerta para crear bloqueos desde el panel
--
-- security invoker (el valor por defecto): corre como el dueño con sesión, así
-- que RLS garantiza que solo escriba en su propio negocio.
--
-- Errores (el mensaje es un código estable, SQLSTATE P0001):
--   sin_sesion         no hay usuario en la petición
--   sin_negocio        el usuario no tiene negocio
--   rango_invalido     falta una fecha o la final es anterior a la inicial
--   rango_muy_largo    más de 366 días
--   fecha_pasada       el último día ya pasó
--   horas_incompletas  viene una hora y la otra no
--   horas_invalidas    la hora final no es posterior a la inicial
--   motivo_largo       el motivo pasa de 120 caracteres
--
-- Regresa cuántos bloqueos creó, la serie (si es franja de varios días) y
-- cuántas citas confirmadas quedan dentro: esas no se cancelan solas, el negocio
-- decide qué hacer con ellas.
-- ---------------------------------------------------------------------------
create or replace function public.crear_bloqueos(
  p_desde       date,
  p_hasta       date,
  p_hora_inicio time default null,   -- null en las dos horas = días completos
  p_hora_fin    time default null,
  p_motivo      text default null
)
returns table (creados integer, serie uuid, citas_afectadas integer)
language plpgsql
set search_path = ''
as $$
declare
  v_negocio uuid := auth.uid();
  v_zona    text;
  v_motivo  text := nullif(pg_catalog.btrim(coalesce(p_motivo, '')), '');
  v_serie   uuid;
  v_creados integer;
  v_citas   integer;
  v_hoy     date;
begin
  if v_negocio is null then
    raise exception 'sin_sesion' using errcode = 'P0001';
  end if;

  select n.zona_horaria into v_zona from public.negocio n where n.id = v_negocio;
  if v_zona is null then
    raise exception 'sin_negocio' using errcode = 'P0001';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'rango_invalido' using errcode = 'P0001';
  end if;
  if p_hasta - p_desde > 365 then
    raise exception 'rango_muy_largo' using errcode = 'P0001';
  end if;
  v_hoy := (pg_catalog.now() at time zone v_zona)::date;
  if p_hasta < v_hoy then
    raise exception 'fecha_pasada' using errcode = 'P0001';
  end if;
  if (p_hora_inicio is null) <> (p_hora_fin is null) then
    raise exception 'horas_incompletas' using errcode = 'P0001';
  end if;
  if p_hora_inicio is not null and p_hora_fin <= p_hora_inicio then
    raise exception 'horas_invalidas' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_motivo) > 120 then
    raise exception 'motivo_largo' using errcode = 'P0001';
  end if;

  -- Una franja de varios días es una serie; un bloqueo de días completos o de un
  -- solo día va suelto.
  if p_hora_inicio is not null and p_hasta > p_desde then
    v_serie := gen_random_uuid();
  end if;

  -- En una sola sentencia: se calculan los rangos, se insertan y se cuentan las
  -- citas confirmadas que caen dentro, con exactamente los mismos rangos.
  with rangos as (
    -- Días completos: un solo rango de medianoche a medianoche (hora local)
    select (p_desde::timestamp) at time zone v_zona as inicio,
           ((p_hasta + 1)::timestamp) at time zone v_zona as fin
    where p_hora_inicio is null
    union all
    -- Franja diaria: un rango por día. Si el día del cambio de horario la franja
    -- cae completa en la hora que no existe (p. ej. 02:00-03:00 al adelantar el
    -- reloj), PostgreSQL corre las dos horas al mismo instante y el rango queda
    -- vacío: ese día se omite, porque no hay nada que bloquear.
    select f.inicio, f.fin
    from (
      select (d::date + p_hora_inicio) at time zone v_zona as inicio,
             (d::date + p_hora_fin) at time zone v_zona as fin
      from pg_catalog.generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as d
      where p_hora_inicio is not null
    ) as f
    where f.fin > f.inicio
  ), nuevos as (
    insert into public.bloqueo (negocio_id, inicio, fin, motivo, serie)
    select v_negocio, r.inicio, r.fin, v_motivo, v_serie from rangos r
    returning bloqueo.inicio, bloqueo.fin
  )
  select (select pg_catalog.count(*) from nuevos)::integer,
         (select pg_catalog.count(distinct c.id)
            from public.cita c
            join nuevos b
              on pg_catalog.tstzrange(c.inicio, c.fin, '[)') && pg_catalog.tstzrange(b.inicio, b.fin, '[)')
           where c.negocio_id = v_negocio
             and c.estado = 'confirmada')::integer
    into v_creados, v_citas;

  return query select v_creados, v_serie, v_citas;
end;
$$;

comment on function public.crear_bloqueos(date, date, time, time, text) is
  'Crea bloqueos de días completos o de una franja diaria en la zona del negocio. '
  'Errores: sin_sesion, sin_negocio, rango_invalido, rango_muy_largo, fecha_pasada, '
  'horas_incompletas, horas_invalidas, motivo_largo.';

revoke execute on function public.crear_bloqueos(date, date, time, time, text) from public, anon;
grant  execute on function public.crear_bloqueos(date, date, time, time, text) to authenticated;
