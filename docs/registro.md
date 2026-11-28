# Registro atómico

Al registrarse, el dueño queda con **usuario y negocio a la vez, o con nada**. Nunca queda un usuario sin negocio.

## El problema que resuelve

Antes, el registro tenía dos pasos separados:

1. `supabase.auth.signUp` crea el usuario en el servicio de autenticación (Auth), con su propia transacción.
2. Después, la app hace un `insert` en `negocio`, que es otra petición y otra transacción.

Si el paso 2 fallaba, el usuario ya existía. Podía fallar por permisos, por la red entre Vercel y Supabase, porque la función del servidor se cortaba, o por un nombre igual a una ruta reservada como "Panel". La app cerraba la sesión, pero el usuario se quedaba. Al entrar, el panel no encontraba su negocio: decía "Mi negocio", no había enlace público y no se podía guardar nada. En producción quedaron tres cuentas así, antes de T-18 (la tarea que dio permisos explícitos a las tablas en la base de la nube).

## Cómo funciona ahora

```
app/registro/actions.ts
  signUp({ email, password, options: { data: { nombre_negocio } } })
        │
        ▼  Auth inserta en auth.users  ─────────────── una sola transacción ──┐
  trigger cupo_negocio_al_registrar (after insert)                            │
        │                                                                     │
        ▼                                                                     │
  cupo_crear_negocio_al_registrar()                                           │
    · nombre = btrim(nombre_negocio); de 1 a 80 caracteres, si no: nombre_invalido
    · slug = cupo_slug_base(nombre); si choca o es reservado, + "-xxxx"       │
    · insert into negocio (id = id del usuario, nombre, slug)  ───────────────┘
```

Si el trigger lanza un error, PostgreSQL deshace todo: el usuario tampoco queda. Auth responde `Database error saving new user`, la app muestra "No pudimos crear tu cuenta. Intenta de nuevo." y el motivo queda en el registro del servidor (`console.error`).

## Contrato

**`cupo_slug_base(nombre) → text`.** Es `immutable` e interna (sin `execute` para la API). Hace esto, en orden:

1. Si el nombre es `NULL`, se toma como vacío. Aplica `normalize(…, NFD)` y quita las marcas combinantes del rango U+0300 a U+036F (en la expresión: `[\u0300-\u036f]`): acentos, diéresis y la tilde de la ñ.
2. Pasa a minúsculas.
3. Cambia cada tramo que no sea `a-z0-9` por un guion.
4. Quita los guiones de las orillas.
5. Recorta a 60 caracteres sin guion al final.
6. Si quedan menos de 3: `negocio-<lo que haya>`, o `negocio` si quedó vacío.

Ejemplos: "Estética Lupita & Co." → `estetica-lupita-co`; "Ñ" → `negocio-n`; "¡¡¡!!!" → `negocio`.

**`cupo_crear_negocio_al_registrar()`.** Es `security definer`, porque Auth no tiene permiso en `negocio`, y usa `search_path` vacío.

- **Sin la llave `nombre_negocio`** en `raw_user_meta_data`: no hace nada.
- **Con la llave pero sin texto** (`null`, un número, una lista): `raise 'nombre_invalido'`. Solo se acepta un texto JSON.
- **Nombre vacío o de más de 80 caracteres** (después de quitar espacios de las orillas): `raise 'nombre_invalido'` (P0001).
- **Choque de slug** con `negocio_slug_key` (ya existe) o con `negocio_slug_no_reservado` (ruta de la app): prueba `rtrim(left(base, 55), '-') || '-' || sufijo`. El sufijo son 4 caracteres; cada uno es `substr('abcdefghijklmnopqrstuvwxyz0123456789', get_byte(b, n) % 36 + 1, 1)` para `n` de 0 a 3, con `b = extensions.gen_random_bytes(4)` (pgcrypto). El `rtrim` evita un `--` cuando el carácter 55 es un guion, que rompería el CHECK.
- **Más de 20 choques** (21 inserciones contando la base): `raise 'slug_sin_lugar'`. Es un tope que avisa en lugar de girar sin fin. No tiene prueba: con 36⁴ sufijos posibles no se puede forzar sin trucar la función.
- **Cualquier otro error:** se vuelve a lanzar, y el `signUp` falla.

## Decisiones

1. **Trigger en `auth.users` y no compensar desde la app.**
   - *Opciones:*
     - (a) trigger en la misma transacción;
     - (b) si el `insert` falla, borrar el usuario con la llave secreta;
     - (c) que el panel pida el nombre si falta el negocio.
   - *Elegida:* (a). Es la única atómica. Con (b), el borrado también puede fallar o no llegar a ejecutarse. (c) repara, pero no evita.
   - *Fuente:* Supabase recomienda este patrón para crear datos del usuario al registrarse: https://supabase.com/docs/guides/auth/managing-user-data#using-triggers
   - *Cómo se comprobó:* `11_registro_atomico.test.sql`. Un nombre vacío hace fallar el `insert` en `auth.users` y la prueba confirma que no quedó usuario.

2. **El trigger solo actúa con `nombre_negocio`.**
   - *Por qué:* la semilla, el panel de Supabase y las pruebas crean usuarios y su negocio por separado. Así siguen funcionando igual.
   - *Cómo se comprobó:* los 11 archivos de pruebas de la base pasan (01 a 11), y una prueba inserta un usuario con `{}` y comprueba que no recibe negocio.

3. **El slug se arma en SQL y se borró `lib/slug.ts`.**
   - *Por qué:* una sola fuente de la regla, al lado del CHECK que la exige. El nombre de ruta reservada, que antes rompía el registro, ahora lleva sufijo.
   - *Cómo se comprobó:* las pruebas de `cupo_slug_base` y el caso "Panel" → `panel-xxxx`.

## Receta para reconstruirlo

1. **Migración `20261128000100_registro_atomico.sql`:**
   - `cupo_slug_base` y `cupo_crear_negocio_al_registrar`;
   - `revoke execute … from public, anon, authenticated` en las dos;
   - `drop trigger if exists` y luego `create trigger cupo_negocio_al_registrar after insert on auth.users for each row execute function …`;
   - requiere pgcrypto en el esquema `extensions`, que ya instala `20261008000100_t03_esquema.sql`.
2. **`supabase/tests/database/11_registro_atomico.test.sql`** (18 pruebas): estructura, slug, registro normal, slug repetido, slug reservado, nombre inválido (vacío, de 81 caracteres, `null` o número) sin usuario a medias y usuario sin `nombre_negocio`.
3. **`app/registro/actions.ts`:** `signUp` con `options.data.nombre_negocio` y, si hay sesión, `redirect("/panel")`. Ya no hay `insert` ni bucle de slug.
4. **Verificar:**
   - `supabase db reset` y `supabase test db`.
   - En la app, regístrate dos veces con el mismo nombre. El segundo debe quedar con sufijo en su enlace público.
   - En producción, después de `npx supabase db push`, revisa en el SQL Editor que no haya usuarios sin negocio:
     ```sql
     select u.email from auth.users u left join public.negocio n on n.id = u.id where n.id is null;
     ```
