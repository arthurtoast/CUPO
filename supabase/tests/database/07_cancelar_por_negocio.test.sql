-- Pruebas de HU-15: cancelar_cita_negocio.
-- El dueño llama con sesión (rol authenticated); el efecto en la página pública
-- se revisa como visitante (rol anon). Fechas relativas a hoy para que no caduquen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

select has_function('public', 'cancelar_cita_negocio', array['uuid'], 'existe cancelar_cita_negocio');
select isnt_definer('public', 'cancelar_cita_negocio', array['uuid'],
                    'corre como quien llama (RLS aplica)');
select ok(not has_function_privilege('anon', 'public.cancelar_cita_negocio(uuid)', 'execute'),
          'el visitante no puede llamarla');

-- Dos negocios con un servicio de 45 min, de lunes a viernes 09:00-14:00
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000101', 'agenda-a@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-000000000102', 'agenda-b@cupo.test');
insert into negocio (id, nombre, slug) values
  ('aaaaaaaa-0000-4000-8000-000000000101', 'Agenda A', 'negocio-agenda-a'),
  ('aaaaaaaa-0000-4000-8000-000000000102', 'Agenda B', 'negocio-agenda-b');
insert into servicio (id, negocio_id, nombre, duracion_min) values
  ('bbbbbbbb-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000101', 'Consulta', 45),
  ('bbbbbbbb-0000-4000-8000-000000000102', 'aaaaaaaa-0000-4000-8000-000000000102', 'Corte', 45);
insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
select n, d, '09:00', '14:00'
from generate_series(1, 5) d,
     (values ('aaaaaaaa-0000-4000-8000-000000000101'::uuid), ('aaaaaaaa-0000-4000-8000-000000000102'::uuid)) as x(n);

create temp table t on commit drop as
select ((((now() at time zone 'America/Monterrey')::date
          + ((8 - extract(isodow from (now() at time zone 'America/Monterrey')::date)::int) % 7) + 7)
         + time '09:45') at time zone 'America/Monterrey') as lunes_0945;
grant select on t to anon, authenticated;

insert into cita (id, negocio_id, servicio_id, inicio, fin, nombre_cliente, correo_cliente, telefono_cliente)
select 'cccccccc-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000101'::uuid,
       'bbbbbbbb-0000-4000-8000-000000000101'::uuid, lunes_0945, lunes_0945 + interval '45 minutes',
       'Ana Ruiz', 'ana@correo.test', '8111111111' from t
union all
select 'cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000101',
       'bbbbbbbb-0000-4000-8000-000000000101', now() - interval '2 hours', now() - interval '75 minutes',
       'Beto', 'beto@correo.test', '8122222222' from t
union all
select 'cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000102',
       'bbbbbbbb-0000-4000-8000-000000000102', lunes_0945, lunes_0945 + interval '45 minutes',
       'Carla', 'carla@correo.test', '8133333333' from t;

-- ---------------------------------------------------------------- sin sesión
set local request.jwt.claims to '';
set local role authenticated;
select throws_ok($$ select * from cancelar_cita_negocio('cccccccc-0000-4000-8000-000000000001') $$,
                 'P0001', 'sin_sesion', 'sin sesión no se cancela nada');

-- ---------------------------------------------------------------- como negocio A
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000101","role":"authenticated"}';
set local role authenticated;

select throws_ok($$ select * from cancelar_cita_negocio('cccccccc-0000-4000-8000-000000000003') $$,
                 'P0001', 'cita_no_encontrada', 'no puede cancelar la cita de otro negocio');
select throws_ok($$ select * from cancelar_cita_negocio('cccccccc-0000-4000-8000-0000000000ff') $$,
                 'P0001', 'cita_no_encontrada', 'una cita que no existe se reporta igual');
select throws_ok($$ select * from cancelar_cita_negocio(null) $$,
                 'P0001', 'cita_no_encontrada', 'un id nulo se reporta igual');
select throws_ok($$ select * from cancelar_cita_negocio('cccccccc-0000-4000-8000-000000000002') $$,
                 'P0001', 'cita_pasada', 'una cita que ya pasó no se cancela');

-- Caso válido: regresa los datos para el correo al cliente
create temp table r on commit drop as
select * from cancelar_cita_negocio('cccccccc-0000-4000-8000-000000000001');

select is((select correo_cliente from r), 'ana@correo.test', 'regresa el correo del cliente para avisarle');
select is((select nombre_cliente from r), 'Ana Ruiz', 'regresa el nombre del cliente');
select is((select servicio_nombre from r), 'Consulta', 'regresa el servicio');
select is((select duracion_min from r), 45, 'regresa la duración');
select ok((select cancelada_en is not null from r), 'regresa la fecha de cancelación');

select is((select estado from cita where id = 'cccccccc-0000-4000-8000-000000000001'), 'cancelada',
          'la cita pasa a cancelada');
select throws_ok($$ select * from cancelar_cita_negocio('cccccccc-0000-4000-8000-000000000001') $$,
                 'P0001', 'cita_ya_cancelada', 'cancelar dos veces no hace nada la segunda vez');

-- ---------------------------------------------------------------- como visitante
reset role;
set local request.jwt.claims to '';
set local role anon;

select is((select count(*)::int from t, vista_ocupado v
            where v.negocio_id = 'aaaaaaaa-0000-4000-8000-000000000101' and v.inicio = t.lunes_0945), 0,
          'el horario se libera en la página pública');
select is((select count(*)::int from t, reservar_cita('negocio-agenda-a', t.lunes_0945,
                                                      'Diego', 'diego@correo.test', '8144444444')), 1,
          'el mismo hueco se puede volver a reservar');

-- ---------------------------------------------------------------- verificación
reset role;
select is((select estado from cita where id = 'cccccccc-0000-4000-8000-000000000003'), 'confirmada',
          'la cita del otro negocio sigue confirmada');
select is((select estado from cita where id = 'cccccccc-0000-4000-8000-000000000002'), 'confirmada',
          'la cita pasada sigue confirmada');
select is((select count(*)::int from cita where id = 'cccccccc-0000-4000-8000-000000000001'), 1,
          'la cita no se borra');

select * from finish();
rollback;
