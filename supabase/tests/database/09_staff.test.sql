-- Pruebas de HU-18: staff, reservar_cita por persona y vistas públicas.
-- Fechas relativas a hoy para que nunca caduquen.
begin;                                                                           -- aporta: todo se deshace al final (rollback)
create extension if not exists pgtap with schema extensions;                     -- aporta: funciones de prueba (plan, is, throws_ok…)
set local search_path = public, extensions;                                      -- aporta: nombres cortos de tablas y de pgTAP

select plan(28);                                                                 -- aporta: cuántas pruebas deben correr

-- ---------------------------------------------------------------- estructura
select has_table('public', 'staff', 'existe la tabla staff');                    -- aporta: la tabla nueva existe
select has_column('public', 'cita', 'staff_id', 'cita tiene staff_id');          -- aporta: la cita guarda con quién es
select has_view('public', 'vista_staff', 'existe la vista pública del staff');   -- aporta: la página puede listar al staff
select columns_are('public', 'vista_staff', array['id', 'negocio_id', 'nombre', 'creado_en'],
                   'vista_staff solo expone id, negocio, nombre y fecha');      -- aporta: nada privado en la vista
select has_column('public', 'vista_ocupado', 'staff_id', 'vista_ocupado dice de quién es cada ocupado'); -- aporta: filtrar por persona
select has_column('public', 'vista_ocupado', 'bloqueo', 'vista_ocupado separa bloqueos de citas');      -- aporta: bloqueos aplican a todos
select has_function('public', 'reservar_cita',
       array['text', 'timestamp with time zone', 'text', 'text', 'text', 'uuid', 'uuid'],
       'reservar_cita recibe p_staff_id');                                       -- aporta: firma de 7 parámetros

-- ---------------------------------------------------------------- datos
insert into auth.users (id, email) values                                        -- aporta: dueños de los negocios de prueba
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'staff@cupo.test'),                   -- aporta: negocio con staff
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'sin-staff@cupo.test'),               -- aporta: negocio sin staff (como antes)
  ('aaaaaaaa-0000-4000-8000-0000000000f3', 'ajeno@cupo.test');                   -- aporta: otro negocio, para RLS
insert into negocio (id, nombre, slug) values                                    -- aporta: los tres negocios
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'Spa', 'negocio-staff'),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'Solo', 'negocio-sin-staff'),
  ('aaaaaaaa-0000-4000-8000-0000000000f3', 'Ajeno', 'negocio-ajeno');
insert into servicio (negocio_id, nombre, duracion_min)                          -- aporta: un servicio de 60 min por negocio
select id, 'Masaje', 60 from negocio where slug in ('negocio-staff', 'negocio-sin-staff', 'negocio-ajeno');
insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)     -- aporta: lunes a viernes 09:00-14:00
select n.id, d, '09:00', '14:00'
from negocio n, generate_series(1, 5) d
where n.slug in ('negocio-staff', 'negocio-sin-staff', 'negocio-ajeno');
insert into staff (id, negocio_id, nombre, activo) values                        -- aporta: dos activos, uno inactivo y uno ajeno
  ('cccccccc-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'Ana', true),
  ('cccccccc-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'Beto', true),
  ('cccccccc-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'Caro', false),
  ('cccccccc-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-0000000000f3', 'Ajena', true);

create temp table f on commit drop as                                            -- aporta: el lunes de la semana próxima a las 10:00
with base as (select (now() at time zone 'America/Monterrey')::date as hoy)
select ((hoy + ((8 - extract(isodow from hoy)::int) % 7) + 7) + time '10:00') at time zone 'America/Monterrey' as lunes10
from base;
grant select on f to anon, authenticated;                                        -- aporta: el visitante y el dueño leen la fecha

-- ---------------------------------------------------------------- como visitante
set local role anon;                                                             -- aporta: igual que la página pública

select is((select count(*)::int from vista_staff where negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000f1'), 2,
          'vista_staff muestra solo al staff activo');                           -- aporta: Caro (inactiva) no se ofrece
select throws_ok($$ select * from staff $$, '42501', null,
                 'el visitante no lee la tabla staff');                          -- aporta: solo la vista es pública

select is((select count(*)::int from f, reservar_cita('negocio-staff', f.lunes10, 'Cliente 1', 'c1@correo.test',
                                                      '8111111111', null, 'cccccccc-0000-4000-8000-0000000000a1')), 1,
          'reserva con Ana a las 10:00');                                        -- aporta: primera cita
select is((select count(*)::int from f, reservar_cita('negocio-staff', f.lunes10, 'Cliente 2', 'c2@correo.test',
                                                      '8122222222', null, 'cccccccc-0000-4000-8000-0000000000a2')), 1,
          'a la misma hora se puede reservar con Beto');                         -- aporta: criterio: misma hora, otra persona
select throws_ok($$ select reservar_cita('negocio-staff', lunes10, 'Cliente 3', 'c3@correo.test',
                                         '8133333333', null, 'cccccccc-0000-4000-8000-0000000000a1') from f $$,
                 '23P01', 'horario_ocupado', 'con la misma persona sigue sin haber doble reserva'); -- aporta: criterio
select throws_ok($$ select reservar_cita('negocio-staff', lunes10 + interval '1 hour', 'Cliente 4', 'c4@correo.test',
                                         '8144444444') from f $$,
                 'P0001', 'staff_invalido', 'si el negocio tiene staff, hay que elegir con quién'); -- aporta: sin staff_id se rechaza
select throws_ok($$ select reservar_cita('negocio-staff', lunes10 + interval '1 hour', 'Cliente 4', 'c4@correo.test',
                                         '8144444444', null, 'cccccccc-0000-4000-8000-0000000000a3') from f $$,
                 'P0001', 'staff_invalido', 'no se reserva con alguien inactivo');  -- aporta: desactivar deja de ofrecer
select throws_ok($$ select reservar_cita('negocio-staff', lunes10 + interval '1 hour', 'Cliente 4', 'c4@correo.test',
                                         '8144444444', null, 'cccccccc-0000-4000-8000-0000000000a4') from f $$,
                 'P0001', 'staff_invalido', 'no se reserva con el staff de otro negocio'); -- aporta: aislamiento entre negocios

select is((select count(*)::int from f, reservar_cita('negocio-sin-staff', f.lunes10, 'Cliente 5', 'c5@correo.test',
                                                      '8155555555')), 1,
          'un negocio sin staff reserva igual que antes');                       -- aporta: criterio: sin staff funciona igual
select is((select count(*)::int from f, reservar_cita('negocio-sin-staff', f.lunes10 + interval '1 hour', 'Cliente 6',
                                                      'c6@correo.test', '8166666666', null,
                                                      'cccccccc-0000-4000-8000-0000000000a1')), 1,
          'sin staff, un p_staff_id cualquiera se ignora');                      -- aporta: no rompe enlaces viejos
select throws_ok($$ select reservar_cita('negocio-sin-staff', lunes10, 'Cliente 7', 'c7@correo.test', '8177777777') from f $$,
                 '23P01', 'horario_ocupado', 'sin staff sigue habiendo un solo carril'); -- aporta: comportamiento de antes

select is((select count(*)::int from f, vista_ocupado v
            where v.negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' and v.inicio = f.lunes10), 2,
          'vista_ocupado tiene las dos citas de las 10:00');                     -- aporta: una por persona
select is((select array_agg(v.staff_id order by v.staff_id) from f, vista_ocupado v
            where v.negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' and v.inicio = f.lunes10),
          array['cccccccc-0000-4000-8000-0000000000a1', 'cccccccc-0000-4000-8000-0000000000a2']::uuid[],
          'cada ocupado dice de quién es');                                      -- aporta: la página filtra por persona
select is((select staff_id from f, vista_ocupado v
            where v.negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000f2' and v.inicio = f.lunes10 + interval '1 hour'), null,
          'en un negocio sin staff la cita queda sin persona');                  -- aporta: el p_staff_id ignorado no se guarda

-- ---------------------------------------------------------------- como el dueño
reset role;                                                                      -- aporta: vuelve a postgres para cambiar de usuario
insert into bloqueo (negocio_id, inicio, fin)                                    -- aporta: un bloqueo para revisar la columna bloqueo
select 'aaaaaaaa-0000-4000-8000-0000000000f1', lunes10 + interval '2 hours', lunes10 + interval '3 hours' from f;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f1","role":"authenticated"}'; -- aporta: sesión del dueño del spa
set local role authenticated;                                                    -- aporta: RLS aplica

select is((select bool_and(bloqueo and staff_id is null) from vista_ocupado
            where negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' and bloqueo), true,
          'los bloqueos salen con bloqueo = true y sin persona');                -- aporta: aplican a todo el staff
select is((select count(*)::int from staff), 3, 'el dueño ve a todo su staff, activo o no'); -- aporta: RLS: solo lo suyo
select lives_ok($$ insert into staff (negocio_id, nombre) values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'Dani') $$,
                'el dueño agrega a alguien a su staff');                         -- aporta: alta desde el panel
select throws_ok($$ insert into staff (negocio_id, nombre) values ('aaaaaaaa-0000-4000-8000-0000000000f3', 'Intruso') $$,
                 '42501', null, 'no puede agregar staff a otro negocio');        -- aporta: RLS en escritura
select lives_ok($$ update staff set activo = false where id = 'cccccccc-0000-4000-8000-0000000000a2' $$,
                'el dueño desactiva a alguien');                                 -- aporta: baja sin borrar
select throws_ok($$ delete from staff where id = 'cccccccc-0000-4000-8000-0000000000a1' $$,
                 '42501', null, 'el staff no se borra (sus citas quedan ligadas)'); -- aporta: historial intacto
select is((select count(*)::int from cita c join staff s on s.id = c.staff_id where s.nombre = 'Beto'), 1,
          'desactivar a Beto no borra su cita');                                 -- aporta: la agenda conserva la cita

reset role;                                                                      -- aporta: postgres para el cierre
select * from finish();                                                          -- aporta: compara corridas contra el plan
rollback;                                                                        -- aporta: no deja nada en la base
