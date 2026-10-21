-- T-06 · Datos semilla para desarrollo local
--
-- Supabase CLI corre este archivo después de las migraciones en cada
-- `supabase db reset`. Crea un negocio de prueba ya configurado para que la página
-- pública (HU-09, HU-10, HU-11) se pueda construir sin esperar la pantalla de
-- configuración (HU-03, HU-04).
--
--   Negocio:     Estética Lupita (los mismos datos que los wireframes)
--   URL pública: /estetica-lupita
--   Inicio de sesión del dueño (solo local):
--       correo:     lupita@cupo.test
--       contraseña: cupo-local-123
--
-- Las fechas de citas y bloqueos se calculan a partir de hoy, así la semilla no
-- caduca. Para cambiar los valores, edita las variables del bloque DO de abajo.

do $$
declare
  -- Ajustes de la semilla
  v_user_id    constant uuid := '11111111-1111-4111-8111-111111111111';
  v_correo     constant text := 'lupita@cupo.test';
  v_password   constant text := 'cupo-local-123';
  v_zona       constant text := 'America/Monterrey';
  v_duracion   constant int  := 45;
  v_servicio   uuid;
  v_hoy        date := (now() at time zone v_zona)::date;
  v_martes     date;
  v_jueves     date;
begin
  -- Usuario de Supabase Auth (con identidad de correo, necesaria para iniciar sesión)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_correo, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    -- GoTrue no acepta NULL en estas columnas de texto: van vacías
    '', '', '', '',
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', v_correo, 'email_verified', true),
    now(), now(), now()
  );

  -- Negocio con la marca del wireframe
  insert into public.negocio (id, nombre, slug, zona_horaria, color_acento, descripcion,
                              correo_contacto, telefono_publico, direccion)
  values (v_user_id, 'Estética Lupita', 'estetica-lupita', v_zona, '#2B5CE6',
          'Corte y peinado en el centro de Guadalupe', 'hola@esteticalupita.test',
          '81 1234 5678', 'Av. Pablo Livas 1420, Guadalupe, N.L.');

  -- Horario del wireframe; la comida (14:00-15:00) se modela partiendo el día
  insert into public.horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
  select v_user_id, d, b.ini, b.fin
  from generate_series(1, 4) as d,                                   -- lunes a jueves
       (values ('09:00'::time, '14:00'::time), ('15:00', '19:00')) as b(ini, fin)
  union all
  select v_user_id, 5, b.ini, b.fin                                  -- viernes
  from (values ('09:00'::time, '14:00'::time), ('15:00', '20:00')) as b(ini, fin)
  union all
  select v_user_id, 6, '10:00', '15:00';                             -- sábado; domingo cerrado

  insert into public.servicio (negocio_id, nombre, duracion_min)
  values (v_user_id, 'Corte y peinado', v_duracion)
  returning id into v_servicio;

  -- Próximo martes y jueves (siempre en el futuro)
  v_martes := v_hoy + ((9 - extract(isodow from v_hoy)::int) % 7);  -- 0 a 6 días al martes
  if v_martes <= v_hoy then
    v_martes := v_martes + 7;
  end if;
  v_jueves := v_martes + 2;

  -- Dos citas confirmadas y una cancelada, alineadas a la rejilla de 45 minutos
  insert into public.cita (negocio_id, servicio_id, inicio, fin,
                           nombre_cliente, correo_cliente, telefono_cliente)
  values
    (v_user_id, v_servicio,
     (v_martes + time '10:30') at time zone v_zona,
     (v_martes + time '10:30') at time zone v_zona + make_interval(mins => v_duracion),
     'Ana Ruiz', 'ana.ruiz@correo.test', '8111111111'),
    (v_user_id, v_servicio,
     (v_jueves + time '16:30') at time zone v_zona,
     (v_jueves + time '16:30') at time zone v_zona + make_interval(mins => v_duracion),
     'Sofía León', 'sofia.leon@correo.test', '8122222222');

  insert into public.cita (negocio_id, servicio_id, inicio, fin,
                           nombre_cliente, correo_cliente, telefono_cliente,
                           estado, cancelada_en)
  values
    (v_user_id, v_servicio,
     (v_jueves + time '09:00') at time zone v_zona,
     (v_jueves + time '09:00') at time zone v_zona + make_interval(mins => v_duracion),
     'Paula Gil', 'paula.gil@correo.test', '8133333333',
     'cancelada', now());

  -- Un bloqueo: el viernes de esa semana por la tarde
  insert into public.bloqueo (negocio_id, inicio, fin, motivo)
  values (v_user_id,
          (v_jueves + 1 + time '15:00') at time zone v_zona,
          (v_jueves + 1 + time '20:00') at time zone v_zona,
          'Curso de colorimetría');
end;
$$;
