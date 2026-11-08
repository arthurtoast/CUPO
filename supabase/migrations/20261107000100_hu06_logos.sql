-- HU-06 · Logo y color de acento
--
-- El logo vive en Supabase Storage, en el bucket "logos". Cada negocio escribe
-- solo en su carpeta, que se llama igual que su id:
--
--   logos/<negocio.id>/logo-<versión>.<png|jpg|webp>
--
-- El bucket es público para leer (la página de reserva no tiene sesión), pero
-- escribir, reemplazar y borrar exige sesión y que la primera carpeta sea
-- auth.uid(). Así un negocio no puede tocar el logo de otro (criterio 4 de HU-06).
--
-- Los límites también viven aquí y no solo en la app: el bucket rechaza archivos
-- de más de 2 MB y tipos que no sean PNG, JPG o WEBP aunque alguien llame a la
-- API de Storage directo.
--
-- El color de acento ya tiene su CHECK en negocio (T-03): '^#[0-9A-Fa-f]{6}$'.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La URL pública del logo apunta a Supabase Storage; nada de javascript: ni
-- data: en un atributo src. Se acepta null (sin logo).
alter table public.negocio
  add constraint negocio_logo_url_http check (logo_url is null or logo_url ~ '^https?://');

-- ---------------------------------------------------------------------------
-- Políticas sobre storage.objects (RLS ya viene activado por Supabase)
--
-- (storage.foldername(name))[1] es la primera carpeta de la ruta.
-- Se usa (select auth.uid()) para que se evalúe una vez por consulta (T-04).
-- select hace falta para que el cliente pueda reemplazar (upsert) y listar sus
-- propios archivos; la lectura pública de la imagen no pasa por estas políticas.
-- ---------------------------------------------------------------------------
create policy logos_ver_los_mios on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy logos_subir_a_mi_carpeta on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy logos_reemplazar_los_mios on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy logos_borrar_los_mios on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
