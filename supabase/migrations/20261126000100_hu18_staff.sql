-- HU-18 · Agenda por miembro del staff
--
-- Sale de la demo con usuario externo del 6 de noviembre (Evidencia 1): en el
-- spa de Carla atienden varias personas y hoy Cupo solo admite una cita a la vez
-- por negocio. Ahora cada negocio puede registrar a su staff; el cliente elige
-- con quién y dos clientes pueden reservar la misma hora con personas distintas.
--
-- Reglas:
--   * Un negocio sin staff activo funciona exactamente igual que antes.
--   * La doble reserva se sigue impidiendo en la base, ahora por persona: la
--     restricción de exclusión incluye staff_id. Las citas sin staff (las de
--     antes de HU-18) forman su propio grupo.
--   * El horario de atención y los bloqueos siguen siendo del negocio entero.
--   * Desactivar a alguien no borra sus citas; solo deja de ofrecerse.

create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocio (id) on delete cascade,
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 60),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  unique (id, negocio_id)
);

create index staff_negocio_idx on public.staff (negocio_id) where activo;

comment on table public.staff is
  'HU-18: personas que atienden en el negocio. El cliente elige con quién reserva.';

alter table public.staff enable row level security;

create policy staff_de_mi_negocio on public.staff
  for all to authenticated
  using (negocio_id = (select auth.uid()))
  with check (negocio_id = (select auth.uid()));

revoke all on table public.staff from anon;
grant select, insert, update on table public.staff to authenticated;
revoke delete on table public.staff from authenticated;

-- ---------------------------------------------------------------------------
-- La cita guarda con quién es. La FK compuesta impide ligar una cita al staff
-- de otro negocio.
-- ---------------------------------------------------------------------------
alter table public.cita add column staff_id uuid;
alter table public.cita
  add constraint cita_staff_del_negocio
  foreign key (staff_id, negocio_id) references public.staff (id, negocio_id);

create index cita_staff_inicio_idx on public.cita (staff_id, inicio) where staff_id is not null;

-- Sin traslape por persona. coalesce agrupa las citas sin staff en un solo
-- carril, que es el comportamiento de antes de HU-18.
alter table public.cita drop constraint cita_sin_traslape;
alter table public.cita
  add constraint cita_sin_traslape exclude using gist (
    negocio_id with =,
    (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    tstzrange(inicio, fin, '[)') with &&
  ) where (estado = 'confirmada');

-- ---------------------------------------------------------------------------
-- Vistas públicas
-- ---------------------------------------------------------------------------
create view public.vista_staff as
  select id, negocio_id, nombre, creado_en
  from public.staff
  where activo;

comment on view public.vista_staff is
  'Staff activo de cada negocio para que el cliente elija con quién. Solo el nombre.';

-- staff_id y bloqueo van al final porque create or replace view solo puede
-- agregar columnas. Los bloqueos aplican a todo el staff; `bloqueo` los separa
-- de las citas sin staff (staff_id nulo), que solo ocupan el carril sin staff,
-- igual que en la restricción cita_sin_traslape.
create or replace view public.vista_ocupado as
  select negocio_id, inicio, fin, staff_id, false as bloqueo
  from public.cita
  where estado = 'confirmada' and fin > pg_catalog.now()
  union all
  select negocio_id, inicio, fin, null::uuid, true
  from public.bloqueo
  where fin > pg_catalog.now();

comment on view public.vista_ocupado is
  'Citas confirmadas y bloqueos futuros, sin datos de quién reservó ni motivo. '
  'staff_id: con quién es la cita (nulo = sin staff). bloqueo: true si aplica a todo el negocio.';

revoke all on table public.vista_staff from public, anon, authenticated;
grant select on table public.vista_staff to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reservar_cita recibe con quién. Se reemplaza la versión de seis parámetros
-- para que no queden dos funciones con el mismo nombre.
-- ---------------------------------------------------------------------------
drop function public.reservar_cita(text, timestamptz, text, text, text, uuid);

create or replace function public.reservar_cita(
  p_slug        text,
  p_inicio      timestamptz,
  p_nombre      text,
  p_correo      text,
  p_telefono    text,
  p_servicio_id uuid default null,  -- null = el servicio activo más antiguo del negocio
  p_staff_id    uuid default null   -- HU-18: obligatorio si el negocio tiene staff activo
)
returns table (cita_id uuid, token_cancelacion text, inicio timestamptz, fin timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio   public.negocio%rowtype;
  v_servicio  public.servicio%rowtype;
  v_fin       timestamptz;
  v_local_ini timestamp;           -- inicio en la hora de pared del negocio
  v_local_fin timestamp;
  v_dia       smallint;
  v_bloque    public.horario_atencion%rowtype;
  v_nombre    text := pg_catalog.btrim(coalesce(p_nombre, ''));
  v_correo    text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_correo, '')));
  v_telefono  text := pg_catalog.regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  v_cita      public.cita%rowtype;
  v_staff_id  uuid;
begin
  -- 1. Negocio
  select * into v_negocio from public.negocio n where n.slug = p_slug;
  if not found then
    raise exception 'negocio_no_existe' using errcode = 'P0001';
  end if;

  -- 2. Servicio (del mismo negocio y activo)
  if p_servicio_id is null then
    select * into v_servicio from public.servicio s
     where s.negocio_id = v_negocio.id and s.activo
     order by s.creado_en, s.id
     limit 1;
  else
    select * into v_servicio from public.servicio s
     where s.id = p_servicio_id and s.negocio_id = v_negocio.id and s.activo;
  end if;
  if not found then
    raise exception 'servicio_invalido' using errcode = 'P0001';
  end if;

  -- 3. Con quién (HU-18): si el negocio registró staff, la cita es con una persona activa de
  -- ese negocio; si no tiene staff, se ignora p_staff_id y todo sigue como antes.
  if exists (select 1 from public.staff st where st.negocio_id = v_negocio.id and st.activo) then
    select st.id into v_staff_id from public.staff st
     where st.id = p_staff_id and st.negocio_id = v_negocio.id and st.activo;
    if v_staff_id is null then
      raise exception 'staff_invalido' using errcode = 'P0001';
    end if;
  end if;

  -- 3b. Datos del cliente (mismas reglas que los CHECK de la tabla, con mensaje claro)
  if pg_catalog.char_length(v_nombre) not between 1 and 120
     or v_correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or v_telefono !~ '^[0-9]{10,15}$' then
    raise exception 'datos_invalidos' using errcode = 'P0001';
  end if;

  -- 4. No en el pasado
  if p_inicio is null or p_inicio <= pg_catalog.now() then
    raise exception 'horario_pasado' using errcode = 'P0001';
  end if;

  v_fin       := p_inicio + pg_catalog.make_interval(mins => v_servicio.duracion_min);
  v_local_ini := pg_catalog.timezone(v_negocio.zona_horaria, p_inicio);
  v_local_fin := pg_catalog.timezone(v_negocio.zona_horaria, v_fin);
  v_dia       := pg_catalog.date_part('isodow', v_local_ini)::smallint;

  -- 5. Dentro de un bloque de atención, completo y en el mismo día
  select * into v_bloque from public.horario_atencion h
   where h.negocio_id = v_negocio.id
     and h.dia_semana = v_dia
     and h.hora_inicio <= v_local_ini::time
     and v_local_fin::time <= h.hora_fin
     and v_local_fin::date = v_local_ini::date
   limit 1;
  if not found then
    raise exception 'fuera_de_horario' using errcode = 'P0001';
  end if;

  -- 6. Alineado a la rejilla: los huecos empiezan en hora_inicio + k * duración
  if ((pg_catalog.date_part('epoch', v_local_ini::time - v_bloque.hora_inicio))::bigint
        % (v_servicio.duracion_min * 60)) <> 0 then
    raise exception 'horario_no_alineado' using errcode = 'P0001';
  end if;

  -- 7. Sin bloqueos encima
  if exists (select 1 from public.bloqueo b
              where b.negocio_id = v_negocio.id
                and pg_catalog.tstzrange(b.inicio, b.fin, '[)')
                    operator(pg_catalog.&&) pg_catalog.tstzrange(p_inicio, v_fin, '[)')) then
    raise exception 'horario_bloqueado' using errcode = 'P0001';
  end if;

  -- 8. Insertar; la restricción de exclusión resuelve la carrera entre dos clientes
  begin
    insert into public.cita (negocio_id, servicio_id, staff_id, inicio, fin,
                             nombre_cliente, correo_cliente, telefono_cliente)
    values (v_negocio.id, v_servicio.id, v_staff_id, p_inicio, v_fin, v_nombre, v_correo, v_telefono)
    returning * into v_cita;
  exception when exclusion_violation then
    raise exception 'horario_ocupado' using errcode = '23P01',
      hint = 'Otra persona acaba de tomar ese horario; elige otro.';
  end;

  return query select v_cita.id, v_cita.token_cancelacion, v_cita.inicio, v_cita.fin;
end;
$$;

comment on function public.reservar_cita(text, timestamptz, text, text, text, uuid, uuid) is
  'Crea una cita confirmada sin cuenta. Errores: negocio_no_existe, servicio_invalido, '
  'staff_invalido, datos_invalidos, horario_pasado, fuera_de_horario, horario_no_alineado, '
  'horario_bloqueado, horario_ocupado.';

revoke execute on function public.reservar_cita(text, timestamptz, text, text, text, uuid, uuid) from public;
grant  execute on function public.reservar_cita(text, timestamptz, text, text, text, uuid, uuid) to anon, authenticated;
