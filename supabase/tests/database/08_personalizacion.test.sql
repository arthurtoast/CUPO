-- Pruebas de HU-16: bucket de portadas, políticas por carpeta y los datos nuevos
-- de la página pública (bienvenida y redes). Cada negocio escribe con su sesión
-- (rol authenticated); la página pública lee como visitante (rol anon).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
-- Desde marzo de 2026 Supabase Storage bloquea los DELETE por SQL directo salvo
-- con esta variable, que su API activa sola. Aquí se activa para probar las
-- políticas de borrado como si llegaran por la API.
set local storage.allow_delete_query to 'true';

select plan(24);

-- ---------------------------------------------------------------- esquema
select is((select public from storage.buckets where id = 'portadas'), true,
          'el bucket portadas existe y es público para leer');
select is((select file_size_limit from storage.buckets where id = 'portadas'), 2097152::bigint,
          'el bucket acepta hasta 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'portadas'),
          array['image/png', 'image/jpeg', 'image/webp'],
          'el bucket solo acepta PNG, JPG y WEBP');
select has_column('public', 'negocio', 'portada_url', 'negocio tiene portada_url');
select has_column('public', 'negocio', 'bienvenida', 'negocio tiene bienvenida');
select columns_are('public', 'vista_marca',
                   array['id', 'slug', 'nombre', 'descripcion', 'logo_url', 'color_acento',
                         'telefono_publico', 'direccion', 'zona_horaria',
                         'portada_url', 'bienvenida', 'instagram', 'facebook', 'whatsapp'],
                   'vista_marca expone los datos de HU-16 y nada más');

-- Dos negocios
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000161', 'portada-a@cupo.test'),
  ('aaaaaaaa-0000-4000-8000-000000000162', 'portada-b@cupo.test');
insert into negocio (id, nombre, slug) values
  ('aaaaaaaa-0000-4000-8000-000000000161', 'Spa A', 'negocio-portada-a'),
  ('aaaaaaaa-0000-4000-8000-000000000162', 'Spa B', 'negocio-portada-b');

-- Una portada que ya tiene el negocio B
insert into storage.objects (bucket_id, name, owner)
values ('portadas', 'aaaaaaaa-0000-4000-8000-000000000162/portada-1.jpg', 'aaaaaaaa-0000-4000-8000-000000000162');

-- ---------------------------------------------------------------- como negocio A
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000161","role":"authenticated"}';
set local role authenticated;

select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('portadas', 'aaaaaaaa-0000-4000-8000-000000000161/portada-1.jpg') $$,
                'el negocio sube una portada a su carpeta');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('portadas', 'aaaaaaaa-0000-4000-8000-000000000162/portada-2.jpg') $$,
                 '42501', null, 'no puede subir a la carpeta de otro negocio');
select is((select count(*)::int from storage.objects where bucket_id = 'portadas'), 1,
          'solo ve sus propias portadas');

-- update y delete sobre la portada de otro no afectan nada (RLS la oculta)
delete from storage.objects where name = 'aaaaaaaa-0000-4000-8000-000000000162/portada-1.jpg';
select throws_ok($$ update storage.objects
                       set name = 'aaaaaaaa-0000-4000-8000-000000000162/movida.jpg'
                     where name = 'aaaaaaaa-0000-4000-8000-000000000161/portada-1.jpg' $$,
                 '42501', null, 'no puede mover su portada a la carpeta de otro');

update negocio
   set portada_url = 'http://127.0.0.1:54321/storage/v1/object/public/portadas/aaaaaaaa-0000-4000-8000-000000000161/portada-1.jpg',
       bienvenida  = 'Bienvenida. Reserva tu masaje en un minuto.',
       instagram   = 'spa.a',
       facebook    = 'profile.php?id=100012345678',
       whatsapp    = '528112345678'
 where id = 'aaaaaaaa-0000-4000-8000-000000000161';
update negocio set portada_url = 'https://ejemplo.com/hackeado.jpg', bienvenida = 'hackeado'
 where id = 'aaaaaaaa-0000-4000-8000-000000000162';

select throws_ok($$ update negocio set portada_url = 'javascript:alert(1)'
                     where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                 '23514', null, 'una portada_url que no es http(s) se rechaza');
select throws_ok($$ update negocio set bienvenida = repeat('a', 161)
                     where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                 '23514', null, 'la bienvenida de más de 160 caracteres se rechaza');
select lives_ok($$ update negocio set bienvenida = repeat('ñ', 160)
                    where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                'la bienvenida cuenta caracteres, no bytes');
select throws_ok($$ update negocio set instagram = '@spa a'
                     where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                 '23514', null, 'un usuario de Instagram con espacios o @ se rechaza');
select throws_ok($$ update negocio set facebook = 'https://facebook.com/spa'
                     where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                 '23514', null, 'Facebook se guarda sin dominio');
select throws_ok($$ update negocio set whatsapp = '8112345678'
                     where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                 '23514', null, 'WhatsApp necesita la lada de país');
select throws_ok($$ update negocio set whatsapp = '+528112345678'
                     where id = 'aaaaaaaa-0000-4000-8000-000000000161' $$,
                 '23514', null, 'WhatsApp se guarda solo con dígitos');

-- ---------------------------------------------------------------- como visitante
reset role;
set local request.jwt.claims to '';
set local role anon;

select ok((select portada_url like '%/portadas/aaaaaaaa-0000-4000-8000-000000000161/%' from vista_marca
            where slug = 'negocio-portada-a'),
          'la página pública ve la URL de la portada');
select is((select bienvenida from vista_marca where slug = 'negocio-portada-a'), repeat('ñ', 160),
          'la página pública ve la bienvenida');
select is((select instagram || ' · ' || facebook || ' · ' || whatsapp from vista_marca
            where slug = 'negocio-portada-a'),
          'spa.a · profile.php?id=100012345678 · 528112345678',
          'la página pública ve las redes');
select is((select instagram from vista_marca where slug = 'negocio-portada-b'), null,
          'una red que el negocio no llenó llega vacía');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('portadas', 'aaaaaaaa-0000-4000-8000-000000000161/portada-9.jpg') $$,
                 '42501', null, 'el visitante no puede subir portadas');

-- ---------------------------------------------------------------- verificación
reset role;
select is((select portada_url from negocio where id = 'aaaaaaaa-0000-4000-8000-000000000162'), null,
          'el negocio A no pudo cambiar la portada del negocio B');
select is((select count(*)::int from storage.objects
            where name = 'aaaaaaaa-0000-4000-8000-000000000162/portada-1.jpg'), 1,
          'el negocio A no pudo borrar la portada del negocio B');

select * from finish();
rollback;
