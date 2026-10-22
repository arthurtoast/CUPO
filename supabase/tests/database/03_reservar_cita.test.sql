-- Pruebas de T-05: restricción sin traslape y función reservar_cita.
-- Todas las llamadas se hacen como visitante sin sesión (rol anon), igual que la
-- página pública. Las fechas se calculan a partir de hoy para que nunca caduquen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

select has_function('public', 'reservar_cita',
                    array['text', 'timestamp with time zone', 'text', 'text', 'text', 'uuid'],
                    'existe reservar_cita');
select is_definer('public', 'reservar_cita',
                  array['text', 'timestamp with time zone', 'text', 'text', 'text', 'uuid'],
                  'reservar_cita corre con permisos del dueño (security definer)');

-- Negocio de prueba: lunes a viernes 09:00-14:00, servicio de 45 min
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'reserva@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'reserva-otro@cupo.test');
insert into negocio (id, nombre, slug) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'Reserva', 'negocio-reserva'),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'Otro', 'negocio-reserva-otro');
insert into servicio (id, negocio_id, nombre, duracion_min, activo, creado_en) values
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Corte',   45, true,  now() - interval '1 day'),
  ('bbbbbbbb-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Antiguo', 30, false, now() - interval '2 day'),
  ('bbbbbbbb-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'Ajeno',   45, true,  now());
insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
select 'aaaaaaaa-0000-4000-8000-0000000000c1', d, '09:00', '14:00' from generate_series(1, 5) d;

-- Fechas: el lunes de la semana próxima (de 7 a 13 días adelante) y su martes
create temp table f on commit drop as
with base as (
  select (now() at time zone 'America/Monterrey')::date as hoy
), lunes as (
  select hoy + ((8 - extract(isodow from hoy)::int) % 7) + 7 as d from base
)
select d as lunes, d + 1 as martes, d - 1 as domingo, d - 14 as lunes_pasado from lunes;

create function pg_temp.en(dia date, hora time) returns timestamptz
language sql stable as $$ select (dia + hora) at time zone 'America/Monterrey' $$;

-- Bloqueo el martes de 09:00 a 12:00
insert into bloqueo (negocio_id, inicio, fin, motivo)
select 'aaaaaaaa-0000-4000-8000-0000000000c1', pg_temp.en(martes, '09:00'), pg_temp.en(martes, '12:00'), 'Junta'
from f;

grant select on f to anon;

-- ---------------------------------------------------------------- como visitante
set local role anon;

select is((select count(*)::int from f, reservar_cita('negocio-reserva', pg_temp.en(f.lunes, '09:45'),
                                                      'Ana Ruiz', 'Ana@Correo.Test', '81 1111 1111')),
          1, 'reserva válida en un hueco libre y alineado');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '09:45'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 '23P01', 'horario_ocupado', 'el mismo hueco no se puede reservar dos veces');

select is((select count(*)::int from f, reservar_cita('negocio-reserva', pg_temp.en(f.lunes, '10:30'),
                                                      'Carla', 'carla@correo.test', '8133333333')),
          1, 'una cita puede empezar justo cuando termina otra (rango [) )');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '10:00'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'horario_no_alineado', 'el inicio debe caer en la rejilla de 45 minutos');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '13:30'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'fuera_de_horario', 'la cita debe terminar dentro del bloque (13:30 + 45 > 14:00)');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(domingo, '10:00'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'fuera_de_horario', 'no se reserva en un día sin horario');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(martes, '09:45'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'horario_bloqueado', 'no se reserva encima de un bloqueo');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes_pasado, '09:45'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'horario_pasado', 'no se reserva en el pasado');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '11:15'),
                                         'Beto', 'beto@correo.test', '123') from f $$,
                 'P0001', 'datos_invalidos', 'el teléfono necesita de 10 a 15 dígitos');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '11:15'),
                                         'Beto', 'beto-sin-arroba', '8122222222') from f $$,
                 'P0001', 'datos_invalidos', 'el correo debe tener formato válido');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '11:15'),
                                         '   ', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'datos_invalidos', 'el nombre no puede ir vacío');

select throws_ok($$ select reservar_cita('no-existe', pg_temp.en(lunes, '11:15'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'negocio_no_existe', 'el slug debe existir');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '11:15'),
                                         'Beto', 'beto@correo.test', '8122222222',
                                         'bbbbbbbb-0000-4000-8000-0000000000c2') from f $$,
                 'P0001', 'servicio_invalido', 'no se puede usar el servicio de otro negocio');

select throws_ok($$ select reservar_cita('negocio-reserva', pg_temp.en(lunes, '11:15'),
                                         'Beto', 'beto@correo.test', '8122222222',
                                         'bbbbbbbb-0000-4000-8000-0000000000c3') from f $$,
                 'P0001', 'servicio_invalido', 'no se puede usar un servicio inactivo');

select throws_ok($$ select * from cita $$, '42501', null,
                 'después de reservar, anon sigue sin poder leer las citas');

-- ---------------------------------------------------------------- verificación
reset role;

select is((select telefono_cliente from cita where nombre_cliente = 'Ana Ruiz'
                and negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'), '8111111111',
          'el teléfono se guarda solo con dígitos');
select is((select correo_cliente from cita where nombre_cliente = 'Ana Ruiz'
                and negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'), 'ana@correo.test',
          'el correo se guarda en minúsculas');
select is((select servicio_id from cita where nombre_cliente = 'Ana Ruiz'
                and negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'),
          'bbbbbbbb-0000-4000-8000-0000000000c1'::uuid,
          'sin servicio explícito se usa el servicio activo más antiguo');

select * from finish();
rollback;
