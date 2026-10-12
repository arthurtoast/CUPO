-- T-03 · Migración inicial: negocio, horario_atencion, servicio, bloqueo, cita
--
-- Convenciones de todo el esquema:
--   * Fechas y horas absolutas en timestamptz: PostgreSQL las guarda en UTC y la
--     aplicación las muestra en la zona horaria del negocio (regla de integridad 2).
--   * horario_atencion usa hora local del negocio (time), porque "lunes 09:00" es
--     una hora de pared, no un instante; se convierte con negocio.zona_horaria.
--   * dia_semana sigue ISO 8601: 1 = lunes ... 7 = domingo (igual que
--     extract(isodow from ...)).
--   * Las reglas viven en la base (CHECK, FK, exclusiones) y no solo en el código.

create extension if not exists pgcrypto with schema extensions;   -- gen_random_bytes
create extension if not exists btree_gist with schema extensions; -- exclusiones con "="

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de validación (inmutables, se usan dentro de CHECK)
-- ---------------------------------------------------------------------------

-- Una zona horaria es válida si PostgreSQL la conoce (America/Monterrey, UTC, ...).
create or replace function public.cupo_zona_horaria_valida(zona text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform pg_catalog.timezone(zona, pg_catalog.now());
  return true;
exception when others then
  return false;
end;
$$;

-- Minutos desde la medianoche; permite comparar rangos de horas con int4range.
create or replace function public.cupo_minuto_del_dia(t time)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (pg_catalog.date_part('hour', t) * 60 + pg_catalog.date_part('minute', t))::integer
$$;

-- ---------------------------------------------------------------------------
-- negocio: un usuario de Supabase Auth es exactamente un negocio
-- ---------------------------------------------------------------------------
create table public.negocio (
  id               uuid primary key references auth.users (id) on delete cascade,
  nombre           text not null check (char_length(btrim(nombre)) between 1 and 80),
  -- El slug es la URL pública: cupo.app/<slug>
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  zona_horaria     text not null default 'America/Monterrey'
                   check (public.cupo_zona_horaria_valida(zona_horaria)),
  logo_url         text,
  color_acento     text not null default '#2B5CE6' check (color_acento ~ '^#[0-9A-Fa-f]{6}$'),
  descripcion      text check (char_length(descripcion) <= 280),
  -- Correo que ven los clientes; distinto del correo con el que el dueño inicia sesión
  correo_contacto  text check (correo_contacto ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono_publico text check (char_length(telefono_publico) <= 30),
  direccion        text check (char_length(direccion) <= 200),
  creado_en        timestamptz not null default now()
);

comment on table public.negocio is
  'Un negocio por usuario de Supabase Auth. Sin credenciales: el id es el de auth.users.';

-- ---------------------------------------------------------------------------
-- horario_atencion: un registro por bloque; la comida se modela partiendo el día
-- ---------------------------------------------------------------------------
create table public.horario_atencion (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocio (id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 1 and 7),
  hora_inicio time not null,
  hora_fin    time not null,
  check (hora_fin > hora_inicio),
  -- Dos bloques del mismo día no se pueden encimar (09-14 y 13-18 sería un error)
  constraint horario_sin_traslape exclude using gist (
    negocio_id with =,
    dia_semana with =,
    int4range(public.cupo_minuto_del_dia(hora_inicio), public.cupo_minuto_del_dia(hora_fin)) with &&
  )
);

create index horario_atencion_negocio_idx on public.horario_atencion (negocio_id, dia_semana);

-- ---------------------------------------------------------------------------
-- servicio: en el MVP cada negocio tiene al menos uno, con su duración estándar
-- ---------------------------------------------------------------------------
create table public.servicio (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   uuid not null references public.negocio (id) on delete cascade,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 80),
  duracion_min integer not null check (duracion_min between 5 and 480),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  -- Permite que cita referencie (servicio, negocio) y garantice que coinciden
  unique (id, negocio_id)
);

create index servicio_negocio_idx on public.servicio (negocio_id) where activo;

-- ---------------------------------------------------------------------------
-- bloqueo: excepciones puntuales (vacaciones, una tarde ocupada)
-- La pantalla para crearlos es HU-05 (Sprint 2), pero la tabla existe desde aquí
-- porque el cálculo de huecos libres (HU-09) ya la descuenta.
-- ---------------------------------------------------------------------------
create table public.bloqueo (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocio (id) on delete cascade,
  inicio     timestamptz not null,
  fin        timestamptz not null,
  motivo     text check (char_length(motivo) <= 120),   -- privado: nunca se muestra al cliente
  check (fin > inicio)
);

create index bloqueo_negocio_rango_idx on public.bloqueo using gist (negocio_id, tstzrange(inicio, fin, '[)'));

-- ---------------------------------------------------------------------------
-- cita: guarda una copia de los datos del cliente porque el cliente no tiene cuenta
-- ---------------------------------------------------------------------------
create table public.cita (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        uuid not null references public.negocio (id) on delete cascade,
  servicio_id       uuid not null,
  inicio            timestamptz not null,
  fin               timestamptz not null,
  nombre_cliente    text not null check (char_length(btrim(nombre_cliente)) between 1 and 120),
  correo_cliente    text not null check (correo_cliente ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Se guarda solo con dígitos; 10 a 15 cubre números nacionales e internacionales
  telefono_cliente  text not null check (telefono_cliente ~ '^[0-9]{10,15}$'),
  estado            text not null default 'confirmada' check (estado in ('confirmada', 'cancelada')),
  -- Regla de integridad 3: token criptográfico, nunca derivado del id
  token_cancelacion text not null unique
                    default pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
  creada_en         timestamptz not null default now(),
  cancelada_en      timestamptz,
  check (fin > inicio),
  -- Regla de integridad 4: cancelar es un cambio de estado con fecha, no un borrado
  check ((estado = 'cancelada') = (cancelada_en is not null)),
  -- El servicio debe pertenecer al mismo negocio que la cita
  foreign key (servicio_id, negocio_id) references public.servicio (id, negocio_id)
);

create index cita_negocio_inicio_idx on public.cita (negocio_id, inicio);

comment on column public.cita.token_cancelacion is
  'Va en el enlace de cancelación del correo. 32 bytes aleatorios en hexadecimal.';
