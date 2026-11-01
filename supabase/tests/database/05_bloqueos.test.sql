-- Pruebas de HU-05: crear_bloqueos y su efecto en la página pública.
-- El dueño llama a crear_bloqueos con sesión (rol authenticated); la reserva se
-- prueba como visitante (rol anon). Fechas relativas a hoy para que no caduquen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select has_function('public', 'crear_bloqueos',
                    array['date', 'date', 'time without time zone', 'time without time zone', 'text'],
                    'existe crear_bloqueos');
select isnt_definer('public', 'crear_bloqueos',
                    array['date', 'date', 'time without time zone', 'time without time zone', 'text'],
                    'crear_bloqueos corre como quien llama (RLS aplica)');
select has_column('public', 'bloqueo', 'serie', 'bloqueo tiene la columna serie');

-- Dos negocios: uno en Monterrey (09:00-19:00 lunes a viernes, 45 min) y uno en
-- Nueva York para el cambio de horario de verano
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'bloquea@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'bloquea-ny@cupo.test');
insert into negocio (id, nombre, slug, zona_horaria) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'Bloquea', 'negocio-bloquea', 'America/Monterrey'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'Bloquea NY', 'negocio-bloquea-ny', 'America/New_York');
insert into servicio (negocio_id, nombre, duracion_min)
values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'Corte', 45);
insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
select 'aaaaaaaa-0000-4000-8000-0000000000e1', d, '09:00', '19:00' from generate_series(1, 5) d;

-- Semana 1 (de 7 a 13 días adelante) para días completos; semana 2 para la franja
create temp table f on commit drop as
with base as (select (now() at time zone 'America/Monterrey')::date as hoy),
     l as (select hoy + ((8 - extract(isodow from hoy)::int) % 7) + 7 as lunes from base)
select lunes, lunes + 4 as viernes, lunes + 8 as martes2, lunes + 10 as jueves2, lunes + 9 as miercoles2,
       (select hoy from base) as hoy
from l;
grant select on f to anon, authenticated;

-- Próximo día en que Nueva York cambia de horario (el desfase de UTC es distinto
-- al del día anterior)
create temp table dst on commit drop as
with dias as (
  select d::date as dia,
         ((d::date + time '12:00') at time zone 'America/New_York') - ((d::date + time '12:00') at time zone 'UTC') as desfase
  from generate_series(current_date + 2, current_date + 400, interval '1 day') d
), marcados as (
  select dia, desfase, lag(desfase) over (order by dia) as anterior from dias
)
select min(dia) as cambio from marcados where desfase <> anterior;
grant select on dst to authenticated;

create function pg_temp.en(dia date, hora time) returns timestamptz
language sql stable as $$ select (dia + hora) at time zone 'America/Monterrey' $$;

-- Una cita confirmada el miércoles de la semana 1 a las 10:30 (para citas_afectadas)
insert into cita (negocio_id, servicio_id, inicio, fin, nombre_cliente, correo_cliente, telefono_cliente)
select 'aaaaaaaa-0000-4000-8000-0000000000e1', s.id, pg_temp.en(f.lunes + 2, '10:30'),
       pg_temp.en(f.lunes + 2, '11:15'), 'Ana', 'ana@correo.test', '8111111111'
from f, servicio s where s.negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000e1';

create temp table r (caso text, creados int, serie uuid, citas int) on commit drop;
grant all on r to authenticated;

-- ---------------------------------------------------------------- como el dueño
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1","role":"authenticated"}';
set local role authenticated;

-- Días completos: lunes a viernes de la semana 1
insert into r select 'dias', b.* from f, crear_bloqueos(f.lunes, f.viernes, null, null, 'Vacaciones') b;
select is((select creados from r where caso = 'dias'), 1, 'días completos crean un solo bloqueo');
select is((select serie from r where caso = 'dias'), null, 'un bloqueo de días completos no tiene serie');
select is((select citas from r where caso = 'dias'), 1, 'avisa que una cita confirmada queda dentro');
select ok((select inicio = pg_temp.en(f.lunes, '00:00') and fin = pg_temp.en(f.viernes + 1, '00:00')
             from bloqueo, f where motivo = 'Vacaciones'),
          'va de las 00:00 del primer día a las 00:00 del día siguiente al último, hora local');

-- Franja diaria: 14:00 a 15:00, martes a jueves de la semana 2
insert into r select 'franja', b.* from f, crear_bloqueos(f.martes2, f.jueves2, '14:00', '15:00', 'Comida') b;
select is((select creados from r where caso = 'franja'), 3, 'una franja de tres días crea tres bloqueos');
select isnt((select serie from r where caso = 'franja'), null, 'la franja de varios días tiene serie');
select is((select count(distinct serie)::int from bloqueo where motivo = 'Comida'), 1,
          'los tres bloqueos comparten la misma serie');
select is((select count(*)::int from bloqueo, f where motivo = 'Comida'
            and (inicio at time zone 'America/Monterrey')::time = '14:00'
            and (fin at time zone 'America/Monterrey')::time = '15:00'), 3,
          'cada bloqueo de la franja va de 14:00 a 15:00 hora local');
select is((select citas from r where caso = 'franja'), 0, 'la franja no toca ninguna cita');

-- Una franja de un solo día va suelta
insert into r select 'un_dia', b.* from f, crear_bloqueos(f.lunes + 14, f.lunes + 14, '10:00', '11:00', null) b;
select is((select serie from r where caso = 'un_dia'), null, 'una franja de un solo día no tiene serie');
select is((select count(*)::int from bloqueo where motivo is null), 1, 'el motivo vacío se guarda como nulo');

-- Errores
select throws_ok($$ select * from f, crear_bloqueos(f.viernes, f.lunes) $$,
                 'P0001', 'rango_invalido', 'la fecha final no puede ser anterior a la inicial');
select throws_ok($$ select * from crear_bloqueos(null, current_date + 10) $$,
                 'P0001', 'rango_invalido', 'faltan fechas');
select throws_ok($$ select * from f, crear_bloqueos(f.lunes, f.lunes + 400) $$,
                 'P0001', 'rango_muy_largo', 'no más de un año');
select throws_ok($$ select * from f, crear_bloqueos(f.hoy - 10, f.hoy - 3) $$,
                 'P0001', 'fecha_pasada', 'no se bloquea algo que ya pasó');
select throws_ok($$ select * from f, crear_bloqueos(f.lunes, f.lunes, '14:00', null) $$,
                 'P0001', 'horas_incompletas', 'las dos horas van juntas');
select throws_ok($$ select * from f, crear_bloqueos(f.lunes, f.lunes, '15:00', '14:00') $$,
                 'P0001', 'horas_invalidas', 'la hora final debe ser posterior');
select throws_ok($$ select * from f, crear_bloqueos(f.lunes, f.lunes, null, null, repeat('x', 121)) $$,
                 'P0001', 'motivo_largo', 'el motivo es de 120 caracteres como máximo');

-- ---------------------------------------------------------------- otro negocio
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e2","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from bloqueo), 0, 'otro negocio no ve los bloqueos ajenos');
select lives_ok($$ select * from dst, crear_bloqueos(dst.cambio - 1, dst.cambio + 1, '14:00', '15:00') $$,
                'un negocio en otra zona crea su franja');
select is((select count(*)::int from bloqueo
            where (inicio at time zone 'America/New_York')::time = '14:00'), 3,
          'con cambio de horario de por medio, cada día queda a las 14:00 hora local');

-- ---------------------------------------------------------------- sin sesión
reset role;
set local request.jwt.claims to '';
set local role authenticated;
select throws_ok($$ select * from f, crear_bloqueos(f.lunes, f.lunes) $$,
                 'P0001', 'sin_sesion', 'sin usuario en la petición no se crea nada');

-- ---------------------------------------------------------------- como visitante
reset role;
set local role anon;

select throws_ok($$ select * from f, crear_bloqueos(f.lunes, f.lunes) $$,
                 '42501', null, 'el visitante no puede crear bloqueos');
select throws_ok($$ select * from bloqueo $$, '42501', null, 'el visitante no puede leer la tabla bloqueo');
select hasnt_column('public', 'vista_ocupado', 'motivo', 'la vista pública no tiene el motivo');

select throws_ok($$ select reservar_cita('negocio-bloquea', pg_temp.en(lunes + 2, '12:45'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'horario_bloqueado', 'en días bloqueados no se reserva');
select throws_ok($$ select reservar_cita('negocio-bloquea', pg_temp.en(martes2, '13:30'),
                                         'Beto', 'beto@correo.test', '8122222222') from f $$,
                 'P0001', 'horario_bloqueado', 'un hueco que pisa la franja (13:30-14:15) no se reserva');
select is((select count(*)::int from f, reservar_cita('negocio-bloquea', pg_temp.en(f.martes2, '15:00'),
                                                      'Carla', 'carla@correo.test', '8133333333')), 1,
          'la franja quita solo esa hora: a las 15:00 sí se reserva');

reset role;
select * from finish();
rollback;
