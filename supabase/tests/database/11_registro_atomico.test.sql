-- Registro atómico: el negocio nace en la misma transacción que el usuario.
begin;                                                                           -- aporta: todo se deshace al final
create extension if not exists pgtap with schema extensions;                     -- aporta: funciones de prueba
set local search_path = public, extensions;                                      -- aporta: nombres cortos

select plan(18);                                                                 -- aporta: cuántas pruebas deben correr

-- ---------------------------------------------------------------- estructura
select has_function('public', 'cupo_slug_base', array['text'], 'existe cupo_slug_base');                -- aporta: el slug se arma en la base
select has_function('public', 'cupo_crear_negocio_al_registrar', 'existe la función del trigger');       -- aporta: la pieza que hace atómico el registro
select has_trigger('auth', 'users', 'cupo_negocio_al_registrar', 'auth.users tiene el trigger');         -- aporta: se dispara al crear el usuario
select ok(not has_function_privilege('authenticated', 'public.cupo_crear_negocio_al_registrar()', 'execute'),
          'nadie de la API puede llamar la función del trigger');                -- aporta: es interna

-- ---------------------------------------------------------------- slug
select is(cupo_slug_base('Estética Lupita & Co.'), 'estetica-lupita-co', 'quita acentos y signos');      -- aporta: mismo formato que antes
select is(cupo_slug_base('Ñ'), 'negocio-n', 'un nombre muy corto se completa');                          -- aporta: mínimo 3 caracteres
select is(cupo_slug_base('¡¡¡!!!'), 'negocio', 'sin letras ni números queda "negocio"');                 -- aporta: nunca vacío
select ok(char_length(cupo_slug_base(repeat('ab ', 40))) <= 60 and cupo_slug_base(repeat('ab ', 40)) !~ '-$',
          'máximo 60 caracteres y sin guion al final');                         -- aporta: cumple el CHECK

-- ---------------------------------------------------------------- registro
insert into auth.users (id, email, raw_user_meta_data)                           -- aporta: como lo hace signUp con options.data
values ('aaaaaaaa-0000-4000-8000-00000000a001', 'uno@cupo.test', '{"nombre_negocio":"  Spa Uno  "}');
select is((select nombre || ' ' || slug from negocio where id = 'aaaaaaaa-0000-4000-8000-00000000a001'),
          'Spa Uno spa-uno', 'el registro crea el negocio con nombre limpio y su slug'); -- aporta: el caso normal

insert into auth.users (id, email, raw_user_meta_data)                           -- aporta: otro negocio con el mismo nombre
values ('aaaaaaaa-0000-4000-8000-00000000a002', 'dos@cupo.test', '{"nombre_negocio":"Spa Uno"}');
select matches((select slug from negocio where id = 'aaaaaaaa-0000-4000-8000-00000000a002'),
               '^spa-uno-[a-z0-9]{4}$', 'si el slug ya existe lleva un sufijo'); -- aporta: slug único

insert into auth.users (id, email, raw_user_meta_data)                           -- aporta: nombre igual a una ruta de la app
values ('aaaaaaaa-0000-4000-8000-00000000a003', 'tres@cupo.test', '{"nombre_negocio":"Panel"}');
select matches((select slug from negocio where id = 'aaaaaaaa-0000-4000-8000-00000000a003'),
               '^panel-[a-z0-9]{4}$', 'un slug reservado también lleva sufijo'); -- aporta: antes este registro fallaba

select throws_ok($$ insert into auth.users (id, email, raw_user_meta_data)
                    values ('aaaaaaaa-0000-4000-8000-00000000a004', 'cuatro@cupo.test', '{"nombre_negocio":"   "}') $$,
                 'P0001', 'nombre_invalido', 'un nombre vacío hace fallar el registro'); -- aporta: falla todo el insert
select is((select count(*)::int from auth.users where email = 'cuatro@cupo.test'), 0,
          'y no queda usuario a medias');                                       -- aporta: la prueba de que es atómico
select throws_ok(format($$ insert into auth.users (id, email, raw_user_meta_data)
                           values ('aaaaaaaa-0000-4000-8000-00000000a005', 'cinco@cupo.test', %L) $$,
                        jsonb_build_object('nombre_negocio', repeat('x', 81))),
                 'P0001', 'nombre_invalido', 'un nombre de más de 80 caracteres también'); -- aporta: mismo tope que la tabla

select throws_ok($$ insert into auth.users (id, email, raw_user_meta_data)
                    values ('aaaaaaaa-0000-4000-8000-00000000a007', 'siete@cupo.test', '{"nombre_negocio":null}') $$,
                 'P0001', 'nombre_invalido', 'nombre_negocio en null también falla'); -- aporta: la llave existe: se valida
select throws_ok($$ insert into auth.users (id, email, raw_user_meta_data)
                    values ('aaaaaaaa-0000-4000-8000-00000000a008', 'ocho@cupo.test', '{"nombre_negocio":123}') $$,
                 'P0001', 'nombre_invalido', 'un número en lugar de texto falla'); -- aporta: solo texto
insert into auth.users (id, email, raw_user_meta_data)                           -- aporta: como la semilla o el panel de Supabase
values ('aaaaaaaa-0000-4000-8000-00000000a006', 'seis@cupo.test', '{}');
select is((select count(*)::int from negocio where id = 'aaaaaaaa-0000-4000-8000-00000000a006'), 0,
          'un usuario creado sin nombre_negocio no recibe negocio');            -- aporta: la semilla y las pruebas siguen igual
select lives_ok($$ insert into negocio (id, nombre, slug) values ('aaaaaaaa-0000-4000-8000-00000000a006', 'Seis', 'seis') $$,
                'y se le puede crear su negocio aparte, como antes');            -- aporta: compatibilidad con seed.sql

select * from finish();                                                          -- aporta: compara corridas contra el plan
rollback;                                                                        -- aporta: no deja nada
