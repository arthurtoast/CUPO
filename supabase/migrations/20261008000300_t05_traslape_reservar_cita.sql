-- T-05 · Restricción de exclusión sin traslape y función reservar_cita
--
-- Regla de integridad 1: dos citas confirmadas del mismo negocio no se pueden encimar
-- en el tiempo. No basta un índice único sobre (negocio, inicio): 10:00-10:45 y
-- 10:30-11:15 empiezan distinto y aun así chocan. La exclusión compara rangos.
-- El rango es '[)': una cita que termina a las 10:45 no choca con otra que empieza
-- a las 10:45. Solo cuentan las confirmadas (regla 4: las canceladas se conservan).

alter table public.cita
  add constraint cita_sin_traslape exclude using gist (
    negocio_id with =,
    tstzrange(inicio, fin, '[)') with &&
  ) where (estado = 'confirmada');

-- ---------------------------------------------------------------------------
-- reservar_cita: la única puerta para crear una cita (el cliente no tiene cuenta)
--
-- Valida, en este orden, y si algo falla lanza una excepción cuyo mensaje es un
-- código estable que la aplicación traduce a un texto para el cliente:
--
--   negocio_no_existe   el slug no corresponde a ningún negocio
--   servicio_invalido   el servicio no existe, es de otro negocio o está inactivo
--   datos_invalidos     nombre vacío, correo mal formado o teléfono sin 10-15 dígitos
--   horario_pasado      el inicio ya pasó
--   fuera_de_horario    no cae completo dentro de un bloque de horario_atencion
--   horario_no_alineado no coincide con la rejilla del bloque (09:00, 09:45, 10:30...)
--   horario_bloqueado   se encima con un bloqueo
--   horario_ocupado     otra cita confirmada ya tomó ese hueco (SQLSTATE 23P01)
--
-- La validación del hueco se repite aquí aunque la página ya solo muestre huecos
-- libres: entre que el cliente ve la lista y confirma, alguien más pudo reservar.
-- La última palabra la tiene la restricción cita_sin_traslape, que es atómica.
--
-- security definer: corre con permisos del dueño de la tabla para poder insertar
-- aunque el rol anon no tenga privilegios. search_path vacío para que nadie pueda
-- redirigir los nombres a tablas propias; por eso todo va calificado con su esquema.
-- ---------------------------------------------------------------------------
create or replace function public.reservar_cita(
  p_slug        text,
  p_inicio      timestamptz,
  p_nombre      text,
  p_correo      text,
  p_telefono    text,
  p_servicio_id uuid default null   -- null = el servicio activo más antiguo del negocio
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

  -- 3. Datos del cliente (mismas reglas que los CHECK de la tabla, con mensaje claro)
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
    insert into public.cita (negocio_id, servicio_id, inicio, fin,
                             nombre_cliente, correo_cliente, telefono_cliente)
    values (v_negocio.id, v_servicio.id, p_inicio, v_fin, v_nombre, v_correo, v_telefono)
    returning * into v_cita;
  exception when exclusion_violation then
    raise exception 'horario_ocupado' using errcode = '23P01',
      hint = 'Otra persona acaba de tomar ese horario; elige otro.';
  end;

  return query select v_cita.id, v_cita.token_cancelacion, v_cita.inicio, v_cita.fin;
end;
$$;

comment on function public.reservar_cita(text, timestamptz, text, text, text, uuid) is
  'Crea una cita confirmada sin cuenta. Errores: negocio_no_existe, servicio_invalido, '
  'datos_invalidos, horario_pasado, fuera_de_horario, horario_no_alineado, '
  'horario_bloqueado, horario_ocupado.';

revoke execute on function public.reservar_cita(text, timestamptz, text, text, text, uuid) from public;
grant  execute on function public.reservar_cita(text, timestamptz, text, text, text, uuid) to anon, authenticated;
