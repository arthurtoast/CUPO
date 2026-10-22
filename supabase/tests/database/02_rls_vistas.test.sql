-- Pruebas de T-04: Row Level Security y vistas públicas.
-- Simulan las tres identidades de la app:
--   * visitante sin sesión      -> rol anon
--   * dueño del negocio A       -> rol authenticated con sub = A
--   * dueño de otro negocio (B) -> rol authenticated con sub = B
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- Datos de apoyo (como postgres, que ignora RLS)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a-rls@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'b-rls@cupo.test');
insert into negocio (id, nombre, slug) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Negocio A', 'negocio-a-rls'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'Negocio B', 'negocio-b-rls');
insert into servicio (id, negocio_id, nombre, duracion_min) values
  ('bbbbbbbb-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Corte', 45);
insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 1, '09:00', '14:00');
insert into bloqueo (negocio_id, inicio, fin, motivo) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', now() + interval '5 day',
   now() + interval '5 day 2 hour', 'Motivo privado');
insert into cita (id, negocio_id, servicio_id, inicio, fin, nombre_cliente, correo_cliente, telefono_cliente)
values ('cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-00000000000a',
        'bbbbbbbb-0000-4000-8000-00000000000a', now() + interval '2 day',
        now() + interval '2 day 45 min', 'Cliente Privado', 'privado@correo.test', '8111111111');

-- RLS activo en las cinco tablas
select ok((select bool_and(relrowsecurity) from pg_class
           where oid in ('public.negocio'::regclass, 'public.horario_atencion'::regclass,
                         'public.servicio'::regclass, 'public.bloqueo'::regclass,
                         'public.cita'::regclass)),
          'RLS está activo en las cinco tablas');

-- ---------------------------------------------------------------- visitante
set local role anon;
set local request.jwt.claims to '';

select throws_ok('select * from negocio', '42501', null, 'anon no puede leer negocio');
select throws_ok('select * from cita',    '42501', null, 'anon no puede leer cita');
select throws_ok($$ insert into cita (negocio_id, servicio_id, inicio, fin, nombre_cliente,
                                      correo_cliente, telefono_cliente)
                    values ('aaaaaaaa-0000-4000-8000-00000000000a',
                            'bbbbbbbb-0000-4000-8000-00000000000a', now() + interval '3 day',
                            now() + interval '3 day 45 min', 'X', 'x@correo.test', '8111111111') $$,
                 '42501', null, 'anon no puede insertar citas directamente');

select is((select nombre from vista_marca where slug = 'negocio-a-rls'), 'Negocio A',
          'anon lee la marca del negocio');
select is((select count(*)::int from vista_servicio where negocio_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 1,
          'anon lee los servicios activos');
select is((select count(*)::int from vista_horario where negocio_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 1,
          'anon lee el horario de atención');
select is((select count(*)::int from vista_ocupado where negocio_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 2,
          'anon ve dos intervalos ocupados (una cita y un bloqueo)');

reset role;
select hasnt_column('public', 'vista_ocupado', 'nombre_cliente', 'vista_ocupado no expone al cliente');
select hasnt_column('public', 'vista_ocupado', 'motivo',         'vista_ocupado no expone el motivo del bloqueo');

-- ---------------------------------------------------------------- dueño de B
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-00000000000b","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from cita), 0, 'B no ve las citas de A');
select is((select count(*)::int from negocio), 1, 'B solo ve su propio negocio');
select is_empty($$ update servicio set nombre = 'Hackeado' returning id $$,
                'B no puede modificar servicios de A');

-- ---------------------------------------------------------------- dueño de A
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from cita), 1, 'A ve sus citas');
select is((select motivo from bloqueo limit 1), 'Motivo privado', 'A ve el motivo de sus bloqueos');
select throws_ok($$ update cita set nombre_cliente = 'Otro' $$, '42501', null,
                 'A no puede cambiar los datos del cliente');
select throws_ok($$ delete from cita $$, '42501', null,
                 'A no puede borrar citas (borrado lógico)');

select lives_ok($$ update cita set estado = 'cancelada' where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
                'A puede cancelar una cita de su agenda');
select isnt((select cancelada_en from cita where id = 'cccccccc-0000-4000-8000-00000000000a'), null,
            'al cancelar se registra cancelada_en automáticamente');
select throws_ok($$ update cita set estado = 'confirmada', cancelada_en = null
                    where id = 'cccccccc-0000-4000-8000-00000000000a' $$,
                 'P0001', 'cita_ya_cancelada', 'una cita cancelada no se puede reactivar');

-- ---------------------------------------------------------------- negocio nuevo
-- Un dueño recién registrado configura todo con su propia sesión (HU-01, HU-03, HU-04)
reset role;
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-00000000000d', 'nuevo-rls@cupo.test');
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-00000000000d","role":"authenticated"}';
set local role authenticated;

select lives_ok($$ insert into negocio (id, nombre, slug, zona_horaria)
                   values ('aaaaaaaa-0000-4000-8000-00000000000d', 'Nuevo', 'negocio-nuevo-rls',
                           'America/Mexico_City') $$,
                'un dueño crea su negocio con su sesión');
select lives_ok($$ insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
                   values ('aaaaaaaa-0000-4000-8000-00000000000d', 1, '09:00', '14:00') $$,
                'un dueño guarda su horario');
select lives_ok($$ insert into servicio (negocio_id, nombre, duracion_min)
                   values ('aaaaaaaa-0000-4000-8000-00000000000d', 'Corte', 45) $$,
                'un dueño guarda su servicio');
select throws_ok($$ insert into negocio (id, nombre, slug)
                    values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Suplantado', 'suplantado-rls') $$,
                 '42501', null, 'nadie puede crear un negocio con el id de otro usuario');

reset role;
select * from finish();
rollback;
