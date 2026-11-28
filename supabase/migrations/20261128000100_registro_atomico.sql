-- Registro atómico: el negocio se crea en la misma transacción que el usuario
--
-- Antes, el registro eran dos pasos separados: supabase.auth.signUp (servicio
-- de Auth) y luego un insert en negocio desde la app. Si el segundo fallaba
-- (permisos, red, la función de Vercel cortada), el usuario quedaba creado sin
-- negocio y el panel no servía. Así quedaron tres cuentas en producción.
--
-- Ahora la app manda el nombre del negocio dentro del signUp
-- (options.data.nombre_negocio) y este trigger crea el negocio al insertar el
-- usuario en auth.users. Los dos van en la misma transacción: si crear el
-- negocio falla, el signUp falla y no queda nada a medias.
--
-- Usuarios creados sin nombre_negocio (la semilla, el panel de Supabase, las
-- pruebas) no se tocan: el trigger solo actúa con ese dato.
--
-- Patrón recomendado por Supabase: https://supabase.com/docs/guides/auth/managing-user-data#using-triggers

-- ---------------------------------------------------------------------------
-- 1. Slug a partir del nombre (antes vivía en lib/slug.ts)
-- ---------------------------------------------------------------------------
-- "Estética Lupita & Co." -> "estetica-lupita-co". Mismas reglas que el CHECK
-- de negocio.slug: minúsculas, números y guiones sueltos, de 3 a 60 caracteres.
create or replace function public.cupo_slug_base(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  with limpio as (                                                               -- aporta: sin acentos, minúsculas y guiones
    select pg_catalog.btrim(
             pg_catalog.regexp_replace(
               pg_catalog.lower(
                 pg_catalog.regexp_replace(normalize(coalesce(p_nombre, ''), NFD), '[\u0300-\u036f]', '', 'g')), -- aporta: quita acentos y diéresis (é -> e, ñ -> n)
               '[^a-z0-9]+', '-', 'g'),                                         -- aporta: todo lo demás se vuelve guion
             '-') as s                                                           -- aporta: sin guiones en las orillas
  ), recortado as (
    select pg_catalog.rtrim(pg_catalog.left(s, 60), '-') as s from limpio       -- aporta: máximo 60 sin guion al final
  )
  select case
           when pg_catalog.char_length(s) >= 3 then s                            -- aporta: ya cumple el mínimo
           when s = '' then 'negocio'                                            -- aporta: nombre sin letras ni números
           else 'negocio-' || s                                                  -- aporta: muy corto: "Ñ" -> "negocio-n"
         end
  from recortado;
$$;

comment on function public.cupo_slug_base(text) is
  'Slug base para la URL pública a partir del nombre del negocio (sin sufijo).';

-- ---------------------------------------------------------------------------
-- 2. Crear el negocio al crear el usuario
-- ---------------------------------------------------------------------------
create or replace function public.cupo_crear_negocio_al_registrar()
returns trigger
language plpgsql
security definer                                                                 -- aporta: corre como el dueño (postgres): Auth no tiene permiso en negocio
set search_path = ''
as $$
declare
  v_nombre      text := pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'nombre_negocio', '')); -- aporta: nombre que mandó la app
  v_base        text;                                                            -- aporta: slug sin sufijo
  v_slug        text;                                                            -- aporta: slug que se intenta
  v_restriccion text;                                                            -- aporta: qué regla falló
  v_intento     int := 0;                                                        -- aporta: cuántos sufijos se han probado
begin
  if new.raw_user_meta_data is null or not (new.raw_user_meta_data ? 'nombre_negocio') then
    return new;                                                                  -- aporta: usuario creado fuera del registro de la app
  end if;
  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'nombre_negocio') is distinct from 'string'
     or pg_catalog.char_length(v_nombre) not between 1 and 80 then                 -- aporta: debe ser texto (no null ni número) de 1 a 80
    raise exception 'nombre_invalido' using errcode = 'P0001';                   -- aporta: falla el signUp entero, sin usuario a medias
  end if;

  v_base := public.cupo_slug_base(v_nombre);                                     -- aporta: "estetica-lupita"
  v_slug := v_base;
  loop
    begin
      insert into public.negocio (id, nombre, slug) values (new.id, v_nombre, v_slug); -- aporta: el negocio, misma transacción
      return new;                                                                -- aporta: listo
    exception
      when unique_violation or check_violation then
        get stacked diagnostics v_restriccion = constraint_name;                 -- aporta: ¿fue el slug?
        if v_restriccion not in ('negocio_slug_key', 'negocio_slug_no_reservado') then
          raise;                                                                 -- aporta: otro error: que falle el signUp
        end if;
    end;
    v_intento := v_intento + 1;
    if v_intento > 20 then                                                       -- aporta: tope que avisa en vez de girar sin fin
      raise exception 'slug_sin_lugar' using errcode = 'P0001';
    end if;
    v_slug := pg_catalog.rtrim(pg_catalog.left(v_base, 55), '-') || '-' ||      -- aporta: "estetica-lupita-x7k2" (máximo 60)
              (select pg_catalog.string_agg(
                        pg_catalog.substr('abcdefghijklmnopqrstuvwxyz0123456789', pg_catalog.get_byte(r.b, n) % 36 + 1, 1), '' order by n) -- aporta: 4 caracteres al azar
                 from (select extensions.gen_random_bytes(4) as b) r,                -- aporta: 4 bytes aleatorios (pgcrypto)
                      pg_catalog.generate_series(0, 3) as n);                         -- aporta: uno por byte
  end loop;
end;
$$;

comment on function public.cupo_crear_negocio_al_registrar() is
  'Trigger de auth.users: crea el negocio del registro en la misma transacción que el usuario.';

-- Las dos funciones son internas: nadie de la API las llama.
revoke execute on function public.cupo_slug_base(text) from public, anon, authenticated;
revoke execute on function public.cupo_crear_negocio_al_registrar() from public, anon, authenticated;

drop trigger if exists cupo_negocio_al_registrar on auth.users;
create trigger cupo_negocio_al_registrar
  after insert on auth.users
  for each row execute function public.cupo_crear_negocio_al_registrar();
