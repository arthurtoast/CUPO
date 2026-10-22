-- Pruebas de T-03: tablas y reglas que viven en la base.
-- Se corren con `supabase test db`. Todo ocurre dentro de una transacción que se
-- deshace al final, así que no dejan rastro en la base local.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- Las cinco tablas del modelo existen
select has_table('public', 'negocio',          'existe negocio');
select has_table('public', 'horario_atencion', 'existe horario_atencion');
select has_table('public', 'servicio',         'existe servicio');
select has_table('public', 'bloqueo',          'existe bloqueo');
select has_table('public', 'cita',             'existe cita');

-- negocio no guarda credenciales y su id es el de auth.users
select hasnt_column('public', 'negocio', 'password',      'negocio no guarda contraseña');
select fk_ok('public', 'negocio', 'id', 'auth', 'users', 'id');

-- Datos de apoyo: un usuario y su negocio de prueba
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'prueba-esquema@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'otro-esquema@cupo.test');
insert into negocio (id, nombre, slug) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Prueba', 'prueba-esquema'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Otro', 'otro-esquema');

select is((select zona_horaria from negocio where slug = 'prueba-esquema'),
          'America/Monterrey', 'la zona horaria por defecto es America/Monterrey');

-- Reglas de negocio
select throws_ok($$ insert into negocio (id, nombre, slug)
                    values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'otro-slug') $$,
                 '23505', null, 'un usuario no puede tener dos negocios');
select throws_ok($$ update negocio set slug = 'Con Espacios' where slug = 'prueba-esquema' $$,
                 '23514', null, 'el slug solo admite minúsculas, números y guiones');
select throws_ok($$ update negocio set slug = 'panel' where slug = 'prueba-esquema' $$,
                 '23514', null, 'el slug no puede ser una ruta de la app (/panel, /entrar, ...)');
select throws_ok($$ update negocio set color_acento = 'azul' where slug = 'prueba-esquema' $$,
                 '23514', null, 'el color de acento debe ser hexadecimal');
select throws_ok($$ update negocio set zona_horaria = 'Marte/Olimpo' where slug = 'prueba-esquema' $$,
                 '23514', null, 'la zona horaria debe existir');

insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
values ('aaaaaaaa-0000-4000-8000-000000000001', 1, '09:00', '14:00');
select throws_ok($$ insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
                    values ('aaaaaaaa-0000-4000-8000-000000000001', 1, '13:00', '18:00') $$,
                 '23P01', null, 'dos bloques del mismo día no se enciman');
select lives_ok($$ insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
                   values ('aaaaaaaa-0000-4000-8000-000000000001', 1, '14:00', '18:00') $$,
                'un bloque puede empezar justo cuando termina otro (comida partida)');
select throws_ok($$ insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
                    values ('aaaaaaaa-0000-4000-8000-000000000001', 8, '09:00', '10:00') $$,
                 '23514', null, 'dia_semana va de 1 (lunes) a 7 (domingo)');

insert into servicio (id, negocio_id, nombre, duracion_min) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte', 45),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'Otro', 30);

select throws_ok($$ insert into cita (negocio_id, servicio_id, inicio, fin, nombre_cliente,
                                      correo_cliente, telefono_cliente)
                    values ('aaaaaaaa-0000-4000-8000-000000000001',
                            'bbbbbbbb-0000-4000-8000-000000000002',
                            now() + interval '1 day', now() + interval '1 day 30 min',
                            'Ana', 'ana@correo.test', '8111111111') $$,
                 '23503', null, 'una cita no puede usar el servicio de otro negocio');

insert into cita (id, negocio_id, servicio_id, inicio, fin, nombre_cliente, correo_cliente, telefono_cliente)
values ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'bbbbbbbb-0000-4000-8000-000000000001', now() + interval '2 day',
        now() + interval '2 day 45 min', 'Ana', 'ana@correo.test', '8111111111');

select matches((select token_cancelacion from cita where id = 'cccccccc-0000-4000-8000-000000000001'),
               '^[0-9a-f]{64}$', 'el token de cancelación son 32 bytes aleatorios en hexadecimal');
select throws_ok($$ insert into cita (negocio_id, servicio_id, inicio, fin, nombre_cliente,
                                      correo_cliente, telefono_cliente)
                    values ('aaaaaaaa-0000-4000-8000-000000000001',
                            'bbbbbbbb-0000-4000-8000-000000000001',
                            now() + interval '3 day', now() + interval '3 day 45 min',
                            'Ana', 'no-es-correo', '8111111111') $$,
                 '23514', null, 'el correo del cliente debe tener formato válido');

select * from finish();
rollback;
