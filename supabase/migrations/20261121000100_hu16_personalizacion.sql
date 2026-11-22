-- HU-16 · Más personalización de la página
--
-- Sale de la demo con usuario externo del 6 de noviembre (Evidencia 1): imagen
-- de portada, mensaje de bienvenida y enlaces a Instagram, Facebook y WhatsApp.
--
-- La portada vive en su propio bucket, "portadas", con la misma regla que los
-- logos (HU-06): cada negocio escribe solo en la carpeta que se llama igual que
-- su id. Va aparte de "logos" porque al cambiar el logo se limpia toda su carpeta.
--
--   portadas/<negocio.id>/portada-<versión>.<png|jpg|webp>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portadas', 'portadas', true, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Columnas nuevas en negocio. Todas opcionales.
--
-- Las redes se guardan normalizadas (lib/personalizacion.ts) y la página arma
-- el enlace; así nunca se pinta un href que escribió el negocio tal cual.
--   instagram: usuario sin @            spa.carla
--   facebook:  página o perfil por id   spa.carla.mty | profile.php?id=1000123
--   whatsapp:  dígitos con lada de país 528112345678
-- ---------------------------------------------------------------------------
alter table public.negocio
  add column portada_url text
    constraint negocio_portada_url_http check (portada_url ~ '^https?://'),
  add column bienvenida text
    constraint negocio_bienvenida_largo check (char_length(bienvenida) <= 160),
  add column instagram text
    constraint negocio_instagram_formato check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column facebook text
    constraint negocio_facebook_formato
    check (facebook ~ '^([A-Za-z0-9.-]{2,80}|profile\.php\?id=[0-9]{5,20})$'),
  add column whatsapp text
    constraint negocio_whatsapp_formato check (whatsapp ~ '^[0-9]{11,15}$');

-- La vista pública suma las columnas al final (create or replace no deja
-- reordenar). Conserva los permisos de T-04: solo select para anon y authenticated.
create or replace view public.vista_marca as
  select id, slug, nombre, descripcion, logo_url, color_acento,
         telefono_publico, direccion, zona_horaria,
         portada_url, bienvenida, instagram, facebook, whatsapp
  from public.negocio;

-- ---------------------------------------------------------------------------
-- Políticas sobre storage.objects, iguales a las de logos (HU-06)
-- ---------------------------------------------------------------------------
create policy portadas_ver_las_mias on storage.objects
  for select to authenticated
  using (bucket_id = 'portadas' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy portadas_subir_a_mi_carpeta on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portadas' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy portadas_reemplazar_las_mias on storage.objects
  for update to authenticated
  using (bucket_id = 'portadas' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'portadas' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy portadas_borrar_las_mias on storage.objects
  for delete to authenticated
  using (bucket_id = 'portadas' and (storage.foldername(name))[1] = (select auth.uid())::text);
