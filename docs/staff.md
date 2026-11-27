# Agenda por persona del staff (HU-18)

Cuando en un negocio atienden varias personas, cada una tiene su propia agenda. El cliente elige con quién reservar y solo ve los horarios libres de esa persona. Dos clientes pueden reservar a la misma hora si es con personas distintas. Con la misma persona sigue sin poder haber dos citas a la vez. Un negocio que no da de alta a nadie funciona exactamente como antes.

## Qué hace cada parte

| Parte | Archivo | Qué hace |
| --- | --- | --- |
| Tabla y reglas | `supabase/migrations/20261126000100_hu18_staff.sql` | Tabla `staff`, columna `cita.staff_id`, traslape por persona, `vista_staff`, columnas nuevas de `vista_ocupado` y el parámetro `p_staff_id` de `reservar_cita` |
| Pruebas de la base | `supabase/tests/database/09_staff.test.sql` | 28 pruebas pgTAP (ver "Contrato") |
| Reglas de la app | `lib/staff.ts` | `elegirStaff`, `ocupadosPara` y `validarNombreStaff`, sin dependencias |
| Pantalla del dueño | `app/panel/equipo/` | Pestaña **Equipo**: agregar, desactivar y reactivar |
| Página pública | `app/[slug]/page.tsx`, `datos.ts`, `reservador.tsx` | Selector "¿Con quién?" (`?con=<id>`) y huecos de esa persona |
| Reserva | `app/[slug]/actions.ts`, `notificar.ts` | Manda `p_staff_id` y pone "Con: Ana" en los correos |
| Agenda | `app/panel/page.tsx`, `semana.tsx`, `actions.ts` | Muestra "con Ana" en la lista, en la semana y en el aviso de cancelación |

## Cómo se decide qué está ocupado

Cada cita confirmada vive en un **carril**: el de su persona, o el carril "sin persona" si `staff_id` es NULL. Los bloqueos cierran todos los carriles del negocio.

| Persona elegida | Le quitan horarios |
| --- | --- |
| Ana | Las citas de Ana y los bloqueos |
| Nadie (el negocio no tiene staff activo) | Las citas sin persona y los bloqueos |

La base lo impone con la restricción de exclusión `cita_sin_traslape` sobre `(negocio_id, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'), tstzrange(inicio, fin, '[)'))`. La página lo repite en `ocupadosPara` con la columna `bloqueo` de `vista_ocupado`, para no ofrecer horarios que la base va a rechazar.

## Contrato

**`reservar_cita(p_slug, p_inicio, p_nombre, p_correo, p_telefono, p_servicio_id, p_staff_id)`**:

- Si el negocio tiene al menos una persona activa, `p_staff_id` debe ser una persona **activa de ese negocio**. Si falta, está inactiva o es de otro negocio, el error es `staff_invalido` (SQLSTATE P0001). La página muestra "Esa persona ya no tiene agenda disponible. Elige con quién y vuelve a intentar."
- Si el negocio no tiene staff activo, `p_staff_id` se ignora y la cita se guarda con `staff_id` NULL. Así los enlaces viejos con `?con=` no fallan.
- Con la misma persona a la misma hora: `horario_ocupado` (23P01), igual que antes.
- Orden de validación: la persona se revisa después del servicio (`servicio_invalido`) y antes de los datos del cliente (`datos_invalidos`).
- Ante `staff_invalido`, la acción hace `refresh()` para que el selector ya no ofrezca a esa persona.
- La revisión de la persona no bloquea la fila: si el dueño la desactiva justo mientras un cliente confirma, esa cita entra. Es aceptable porque desactivar no cancela citas.

**`vista_staff`**: `id, negocio_id, nombre, creado_en`, solo personas activas. La página las ordena por `creado_en, id`.

**`vista_ocupado`**: `negocio_id, inicio, fin, staff_id, bloqueo`, solo de lo que aún no termina (`fin > now()`). En las citas, `bloqueo` es false. En los bloqueos, `staff_id` es NULL y `bloqueo` es true. Las columnas nuevas van al final, porque `create or replace view` solo deja agregar columnas después de las que ya había.

**Tabla `staff`**: `id, negocio_id, nombre, activo, creado_en`. El CHECK es `char_length(btrim(nombre)) between 1 and 60`. Solo quita espacios ASCII y no junta los repetidos, así que la app normaliza antes con `validarNombreStaff`. El dueño la lee, inserta y actualiza solo en su negocio (RLS `negocio_id = auth.uid()`). Nadie la puede borrar, porque las citas apuntan a ella con la llave compuesta `(staff_id, negocio_id)`, y esa llave también impide ligar una cita a una persona de otro negocio. El visitante no lee la tabla, solo la vista.

**`elegirStaff(staff, con)`** con `?con=<id>` en la página pública: si es un id válido de una persona activa, se elige a esa persona. Si falta, está mal escrito o es de otro negocio, se elige a la primera. No importan mayúsculas ni minúsculas, y si el parámetro viene repetido se ignora.

**`ocupadosPara(ocupados, staffId)`**: devuelve solo `{ inicio, fin }`. Compara `staff_id === staffId` exacto, así que "sin persona" se pasa como `null` (la página usa `elegido?.id ?? null`).

**`validarNombreStaff(valor)`**: devuelve `{ ok: true, nombre }` o `{ ok: false, error }` con el texto para el dueño. Quita los espacios de los extremos, junta los espacios repetidos y cuenta caracteres (no unidades UTF-16, para que "ñ" cuente como uno, igual que `char_length`). El nombre debe tener de 1 a 60 caracteres.

## Decisiones

1. **Desactivar y no borrar.**
   - *Por qué:* las citas guardan con quién son, y borrar a la persona las dejaría huérfanas o se las llevaría. Desactivar la quita del selector y de `reservar_cita`, pero su agenda conserva las citas.
   - *Cómo se comprobó:* pgTAP intenta un `delete` (42501) y revisa que la cita de Beto sigue después de desactivarlo. La prueba en el navegador desactiva a Beto, comprueba que la página solo ofrece a Ana y que la cita de Beto sigue en la agenda.

2. **Una columna `bloqueo` en `vista_ocupado`.**
   - *Opciones:* (a) agregar `staff_id` nada más; (b) `staff_id` y `bloqueo`.
   - *Elegida:* (b). Con (a), un bloqueo y una cita sin persona se ven iguales (los dos con `staff_id` NULL). Con staff, la página habría ofrecido los horarios bloqueados o habría ocultado los ocupados en el carril sin persona.
   - *Cómo se comprobó:* `lib/staff.test.ts` tiene una cita de cada carril y un bloqueo. pgTAP revisa que los bloqueos salen con `bloqueo = true` y sin persona. La prueba en el navegador reserva a las 9:00 con Ana y luego con Beto, y con Ana las 9:00 salen tachadas.
   - *Fuente:* PostgreSQL, `CREATE VIEW` (solo se pueden agregar columnas al final): https://www.postgresql.org/docs/current/sql-createview.html

3. **La persona elegida va en la dirección (`?con=`) y no en un estado del navegador.**
   - *Por qué:* el servidor calcula los huecos de esa persona antes de mandar la página, así que funciona sin JavaScript y el enlace se puede compartir ("reserva con Ana"). Los enlaces usan `replace` y `scroll={false}` para no llenar el historial ni brincar arriba. El `key` del reservador cambia con la persona, así que el día y la hora elegidos se reinician.

4. **Las citas sin persona no estorban a quien se da de alta después.**
   - *Por qué:* es la regla que ya impone la base (carril por `coalesce`). Si el negocio tenía citas antes de agregar staff, esas citas siguen en la agenda pero no le quitan horarios a Ana ni a Beto. El dueño debe revisar las citas que ya tenía al dar de alta a su equipo.
   - *Límite conocido:* si un negocio desactiva a todo su staff, sus citas con persona dejan de bloquear el carril sin persona.
   - *Cómo se comprobó:* pgTAP (`09_staff`) reserva con Ana y con Beto a la misma hora y comprueba que la cita de un negocio sin staff queda con `staff_id` NULL. `npm run test:integracion` corre las pruebas de antes sobre un negocio sin staff y pasan sin cambios.

5. **Se elige a la primera persona por defecto.**
   - *Por qué:* así la página nunca queda sin horarios por un parámetro mal escrito, y el cliente ve de inmediato con quién está reservando.
   - *Cómo se comprobó:* `lib/staff.test.ts` (parámetro ausente, mal formado, ajeno o repetido).

Fuentes:

- PostgreSQL, restricciones de exclusión: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION
- PostgREST, embebido con llave explícita (`staff!cita_staff_del_negocio`): https://docs.postgrest.org/en/stable/references/api/resource_embedding.html
- Next.js, `Link` con `replace` y `scroll`: https://nextjs.org/docs/app/api-reference/components/link

## Dependencias

| Función | Usa |
| --- | --- |
| Pantalla Equipo | `@supabase/ssr`, `next` (`connection`, `refresh`), `react` (`useActionState`) |
| Selector | `next/link` |
| Reglas | `lib/staff.ts`, sin dependencias |
| Base | `btree_gist` (exclusión con igualdad de uuid), `auth.uid()` |

## Receta para reconstruirlo

1. **Migración:** tabla `staff` con `unique (id, negocio_id)`, RLS y `grant select, insert, update ... to authenticated` (sin `delete`). Luego `cita.staff_id` con la llave `cita_staff_del_negocio (staff_id, negocio_id)`, `drop constraint cita_sin_traslape` y recrearla con `coalesce`, `vista_staff` (`grant select ... to anon, authenticated`), `vista_staff`, `vista_ocupado` con `staff_id` y `bloqueo`, y `reservar_cita` con el séptimo parámetro (`drop function` de la firma de 6 antes de crear la nueva y `grant execute ... to anon, authenticated`).
2. **Pruebas pgTAP:** en `03_reservar_cita`, cambia los arreglos de tipos de `has_function` e `is_definer` a 7 (`..., 'uuid', 'uuid'`). Agrega `09_staff` (28 pruebas): estructura, vistas como visitante, misma hora con otra persona, `staff_invalido` (falta, inactiva, ajena), negocio sin staff, columnas de `vista_ocupado`, y RLS del dueño (agregar, desactivar, no borrar, no escribir en otro negocio).
3. **`lib/staff.ts`** y sus pruebas.
4. **Página pública:** en `datos.ts`, lee `vista_staff` y las columnas nuevas de `vista_ocupado`. En `page.tsx`, `elegirStaff(staff, con)` y `ocupadosPara(ocupados, elegido?.id ?? null)`. En `reservador.tsx`, el selector y el campo oculto `staff_id`. En `actions.ts`, `p_staff_id`.
5. **Panel:** `app/panel/equipo/page.tsx` (lista, activos primero), `actions.ts` (`agregarStaff` con `useActionState` y `cambiarActivo`, ambos con `refresh()`) y `formulario-staff.tsx` (client component). Pestaña Equipo en `app/panel/navegacion.tsx`. En `lib/correos.ts`, una fila "Con" (`filaStaff`) en los tres correos cuando hay persona. Y "con X" en la agenda con el embebido `staff:staff!cita_staff_del_negocio(nombre)`. Hay que nombrar la llave porque `cita` y `staff` también se relacionan por `negocio_id`.
6. **Verificar:**
   - `supabase db reset`, `supabase test db`, `npm test` y `npm run test:integracion`.
   - Entra como `lupita@cupo.test` / `cupo-local-123` y agrega a Ana y Beto en **Equipo**.
   - En `/estetica-lupita`, reserva a las 9:00 con Ana y luego con Beto. Con Ana, las 9:00 deben salir tachadas.
   - En la agenda, revisa que diga "con Ana" y "con Beto".
