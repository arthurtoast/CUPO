-- Pruebas de HU-06 y HU-07: bucket de logos, políticas por carpeta y datos de
-- marca que ve la página pública. Cada negocio escribe con su sesión (rol
-- authenticated); la página pública lee como visitante (rol anon).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- ---------------------------------------------------------------- bucket
select is((select public from storage.buckets where id = 'logos'), true,
          'el bucket logos existe y es público para leer');
select is((select file_size_limit from storage.buckets where id = 'logos'), 2097152::bigint,
          'el bucket acepta hasta 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'logos'),
          array['image/png', 'image/jpeg', 'image/webp'],
          'el bucket solo acepta PNG, JPG y WEBP');
select policies_are('storage', 'objects',
                    array['logos_ver_los_mios', 'logos_subir_a_mi_carpeta',
                          'logos_reemplazar_los_mios', 'logos_borrar_los_mios'],
                    'storage.objects tiene las cuatro políticas de logos');

-- Dos negocios
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'marca-a@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'marca-b@cupo.test');
insert into negocio (id, nombre, slug) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'Marca A', 'negocio-marca-a'),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'Marca B', 'negocio-marca-b');

-- Un logo que ya tiene el negocio B
insert into storage.objects (bucket_id, name, owner)
values ('logos', 'aaaaaaaa-0000-4000-8000-0000000000f2/logo-1.png', 'aaaaaaaa-0000-4000-8000-0000000000f2');

-- ---------------------------------------------------------------- como negocio A
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f1","role":"authenticated"}';
set local role authenticated;

select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('logos', 'aaaaaaaa-0000-4000-8000-0000000000f1/logo-1.png') $$,
                'el negocio sube un logo a su carpeta');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('logos', 'aaaaaaaa-0000-4000-8000-0000000000f2/logo-2.png') $$,
                 '42501', null, 'no puede subir a la carpeta de otro negocio');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('logos', 'logo-suelto.png') $$,
                 '42501', null, 'no puede subir fuera de una carpeta');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('otro-bucket', 'aaaaaaaa-0000-4000-8000-0000000000f1/x.png') $$,
                 '42501', null, 'las políticas solo abren el bucket logos');

select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 1,
          'solo ve sus propios archivos');

-- update y delete sobre el archivo de otro no afectan nada (RLS lo oculta)
update storage.objects set name = 'aaaaaaaa-0000-4000-8000-0000000000f1/robado.png'
 where name = 'aaaaaaaa-0000-4000-8000-0000000000f2/logo-1.png';
delete from storage.objects where name = 'aaaaaaaa-0000-4000-8000-0000000000f2/logo-1.png';

select throws_ok($$ update storage.objects
                       set name = 'aaaaaaaa-0000-4000-8000-0000000000f2/movido.png'
                     where name = 'aaaaaaaa-0000-4000-8000-0000000000f1/logo-1.png' $$,
                 '42501', null, 'no puede mover su logo a la carpeta de otro');

select lives_ok($$ delete from storage.objects
                    where name = 'aaaaaaaa-0000-4000-8000-0000000000f1/logo-1.png' $$,
                'puede borrar su propio logo');

-- Marca y contacto (HU-06 y HU-07): RLS deja editar solo su fila
update negocio
   set logo_url = 'http://127.0.0.1:54321/storage/v1/object/public/logos/aaaaaaaa-0000-4000-8000-0000000000f1/logo-1.png',
       color_acento = '#D9480F',
       descripcion = 'Uñas y pestañas en San Nicolás',
       telefono_publico = '81 2222 3333',
       direccion = 'Av. Universidad 100, San Nicolás'
 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
update negocio set descripcion = 'hackeado' where id = 'aaaaaaaa-0000-4000-8000-0000000000f2';

select throws_ok($$ update negocio set color_acento = 'red'
                     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
                 '23514', null, 'un color que no es #RRGGBB se rechaza');
select throws_ok($$ update negocio set logo_url = 'javascript:alert(1)'
                     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
                 '23514', null, 'un logo_url que no es http(s) se rechaza');
select throws_ok($$ update negocio set descripcion = repeat('a', 281)
                     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
                 '23514', null, 'la descripción de más de 280 caracteres se rechaza');
select throws_ok($$ update negocio set telefono_publico = repeat('1', 31)
                     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
                 '23514', null, 'el teléfono de más de 30 caracteres se rechaza');
select throws_ok($$ update negocio set direccion = repeat('a', 201)
                     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
                 '23514', null, 'la dirección de más de 200 caracteres se rechaza');

-- ---------------------------------------------------------------- como visitante
reset role;
set local request.jwt.claims to '';
set local role anon;

select is((select color_acento from vista_marca where slug = 'negocio-marca-a'), '#D9480F',
          'la página pública ve el color elegido');
select is((select descripcion from vista_marca where slug = 'negocio-marca-a'), 'Uñas y pestañas en San Nicolás',
          'la página pública ve la descripción');
select is((select telefono_publico || ' · ' || direccion from vista_marca where slug = 'negocio-marca-a'),
          '81 2222 3333 · Av. Universidad 100, San Nicolás',
          'la página pública ve teléfono y dirección');
select ok((select logo_url like '%/logos/aaaaaaaa-0000-4000-8000-0000000000f1/%' from vista_marca
            where slug = 'negocio-marca-a'),
          'la página pública ve la URL del logo');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('logos', 'aaaaaaaa-0000-4000-8000-0000000000f1/logo-9.png') $$,
                 '42501', null, 'el visitante no puede subir logos');

-- ---------------------------------------------------------------- verificación
reset role;
select is((select descripcion from negocio where id = 'aaaaaaaa-0000-4000-8000-0000000000f2'), null,
          'el negocio A no pudo cambiar la descripción del negocio B');

select * from finish();
rollback;
