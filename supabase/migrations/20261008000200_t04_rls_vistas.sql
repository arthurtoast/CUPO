-- T-04 · RLS en todas las tablas del negocio y vistas públicas para la página de reserva
--
-- Quién puede qué:
--   * Negocio (rol authenticated): lee y modifica solo sus filas (auth.uid() = negocio).
--     Sobre cita solo puede leer y cancelar; nunca crearla ni borrarla.
--   * Visitante sin sesión (rol anon): ningún permiso sobre las tablas. Solo lee las
--     vistas públicas de abajo y, desde T-05, ejecuta reservar_cita.
--
-- Se usa (select auth.uid()) en lugar de auth.uid() para que PostgreSQL lo evalúe
-- una vez por consulta y no una vez por fila (recomendación de Supabase).

-- ---------------------------------------------------------------------------
-- 1. Permisos de tabla: el anónimo no toca ninguna tabla directamente
-- ---------------------------------------------------------------------------
revoke all on table public.negocio, public.horario_atencion, public.servicio,
                    public.bloqueo, public.cita
  from anon;

-- Las funciones auxiliares de validación se ejecutan con los permisos de quien escribe
-- (los CHECK y la exclusión de horario las llaman al guardar), así que el negocio
-- autenticado las necesita. El anónimo nunca escribe en estas tablas.
revoke execute on function public.cupo_zona_horaria_valida(text), public.cupo_minuto_del_dia(time)
  from public, anon;
grant  execute on function public.cupo_zona_horaria_valida(text), public.cupo_minuto_del_dia(time)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security (regla de integridad 5)
-- ---------------------------------------------------------------------------
alter table public.negocio          enable row level security;
alter table public.horario_atencion enable row level security;
alter table public.servicio         enable row level security;
alter table public.bloqueo          enable row level security;
alter table public.cita             enable row level security;

-- negocio: cada usuario ve, crea y edita únicamente su propia fila
create policy negocio_propio on public.negocio
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Tablas de configuración: el dueño las administra por completo
create policy horario_de_mi_negocio on public.horario_atencion
  for all to authenticated
  using (negocio_id = (select auth.uid()))
  with check (negocio_id = (select auth.uid()));

create policy servicio_de_mi_negocio on public.servicio
  for all to authenticated
  using (negocio_id = (select auth.uid()))
  with check (negocio_id = (select auth.uid()));

create policy bloqueo_de_mi_negocio on public.bloqueo
  for all to authenticated
  using (negocio_id = (select auth.uid()))
  with check (negocio_id = (select auth.uid()));

-- cita: el negocio la ve y la cancela; crearla solo es posible con reservar_cita (T-05)
create policy cita_ver_mi_agenda on public.cita
  for select to authenticated
  using (negocio_id = (select auth.uid()));

create policy cita_cancelar_de_mi_agenda on public.cita
  for update to authenticated
  using (negocio_id = (select auth.uid()))
  with check (negocio_id = (select auth.uid()));

-- Sin políticas de insert/delete sobre cita: RLS las niega. Además se quitan los
-- privilegios para que el error sea explícito, y el update queda limitado a dos columnas.
revoke insert, delete, truncate on table public.cita from authenticated;
revoke update on table public.cita from authenticated;
grant  update (estado, cancelada_en) on table public.cita to authenticated;

-- Una cita solo puede pasar de confirmada a cancelada, nunca al revés, y la fecha
-- de cancelación se pone sola. Aplica a cualquier escritura, venga de donde venga.
create or replace function public.cita_transicion_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    if old.estado = 'cancelada' then
      raise exception 'cita_ya_cancelada' using errcode = 'P0001',
        hint = 'Una cita cancelada no se puede reactivar; se reserva una nueva.';
    end if;
    new.cancelada_en := coalesce(new.cancelada_en, pg_catalog.now());
  end if;
  return new;
end;
$$;

create trigger cita_transicion_estado
  before update of estado on public.cita
  for each row execute function public.cita_transicion_estado();

-- ---------------------------------------------------------------------------
-- 3. Vistas públicas: lo único que lee la página de reserva sin sesión
--
-- Una vista normal corre con los permisos de su dueño (postgres), así que lee por
-- encima de RLS. Por eso cada vista selecciona solo columnas públicas: nunca nombre,
-- correo o teléfono de un cliente, ni el token, ni el motivo de un bloqueo.
-- El linter de Supabase las marca como "security definer view"; es intencional.
-- ---------------------------------------------------------------------------
create view public.vista_marca as
  select id, slug, nombre, descripcion, logo_url, color_acento,
         telefono_publico, direccion, zona_horaria
  from public.negocio;

-- creado_en permite elegir el mismo servicio que reservar_cita usa por defecto
-- (el activo más antiguo).
create view public.vista_servicio as
  select id, negocio_id, nombre, duracion_min, creado_en
  from public.servicio
  where activo;

create view public.vista_horario as
  select negocio_id, dia_semana, hora_inicio, hora_fin
  from public.horario_atencion;

-- Intervalos que ya no se pueden reservar. Solo los que todavía no terminan:
-- el pasado no le sirve a la página y así se expone lo mínimo.
create view public.vista_ocupado as
  select negocio_id, inicio, fin
  from public.cita
  where estado = 'confirmada' and fin > pg_catalog.now()
  union all
  select negocio_id, inicio, fin
  from public.bloqueo
  where fin > pg_catalog.now();

comment on view public.vista_ocupado is
  'Citas confirmadas y bloqueos futuros, sin datos de quién reservó ni motivo.';

revoke all on table public.vista_marca, public.vista_servicio,
                    public.vista_horario, public.vista_ocupado
  from public, anon, authenticated;
grant select on table public.vista_marca, public.vista_servicio,
                      public.vista_horario, public.vista_ocupado
  to anon, authenticated;
