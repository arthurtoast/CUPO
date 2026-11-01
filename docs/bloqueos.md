# Bloqueos (HU-05)

El negocio cierra fechas u horas específicas y en esos ratos sus clientes no ven horarios libres. La página pública ya descontaba la tabla `bloqueo` desde el Sprint 1 (`vista_ocupado`, HU-09). Esta historia agrega cómo crearlos y quitarlos desde el panel.

Hay dos tipos:

- **Días completos:** "del 2 al 6 de noviembre", por ejemplo para vacaciones. Se guarda un solo bloqueo, de las 00:00 del primer día a las 00:00 del día siguiente al último.
- **Franja diaria:** "de 14:00 a 15:00, del 2 al 6 de noviembre", por ejemplo para una comida o un curso. Se guarda un bloqueo por día, y todos comparten el mismo `serie` para mostrarse y quitarse juntos.

Una franja de un solo día y los bloqueos de días completos van sueltos (`serie` nula).

## Qué hace cada parte

| Parte | Para qué sirve | Por qué así |
| --- | --- | --- |
| Columna `bloqueo.serie` | Agrupa los días de una franja | Para quitar la franja completa con un clic y mostrarla como una sola entrada |
| `crear_bloqueos(desde, hasta, hora_inicio, hora_fin, motivo)` (SQL) | Convierte fechas y horas locales en bloqueos e inserta las filas | La conversión a UTC con la zona del negocio se hace en la base, igual que en `reservar_cita`, para que el horario de verano se resuelva igual en los dos lados |
| `lib/bloqueos.ts` · `validarBloqueo` | Revisa el formulario antes de llamar a la base | Da textos claros y evita viajes inútiles; la base vuelve a validar todo |
| `lib/bloqueos.ts` · `agruparBloqueos` | Convierte las filas en entradas legibles (formatos abajo) | El negocio piensa en lo que creó, no en filas sueltas |
| `app/panel/bloqueos/page.tsx` | Lista los próximos bloqueos y muestra el formulario | Solo lista los que todavía no terminan; RLS limita las filas al propio negocio |
| `app/panel/bloqueos/actions.ts` | `crearBloqueo` llama a `crear_bloqueos`; `quitarBloqueo` borra por `id` o por `serie` | Server Actions (acciones del servidor) con la sesión del dueño |
| `app/panel/bloqueos/formulario-bloqueo.tsx` | Formulario con modo "Todo el día" o "Solo unas horas" | Se envía con `onSubmit` y no con `action`; ver la decisión 4 |
| `app/panel/navegacion.tsx` | Pestaña "Bloqueos" en el panel | Junto a Agenda y Disponibilidad |

### Formatos de `agruparBloqueos`

Recibe filas `{id, inicio, fin, motivo, serie}` **ordenadas por `inicio`** (la página las pide con `order("inicio")`) y devuelve `EntradaBloqueo {clave, ids, serie, descripcion, motivo, inicio}`, también ordenadas por inicio.

| Caso | Descripción |
| --- | --- |
| Días completos, un día | `Martes 10 de noviembre · Todo el día` |
| Días completos, varios días | `Del lunes 2 al viernes 6 de noviembre · Todo el día` (sin conteo de días) |
| Franja de varios días (serie) | `Del martes 10 al jueves 12 de noviembre · 14:00–15:00 cada día (3 días)` |
| Franja de un día, o serie de la que solo queda un día | `Viernes 6 de noviembre · 15:00–20:00` |
| Bloqueo suelto que cruza la medianoche | `Lunes 9 de noviembre 23:00 al martes 10 de noviembre 00:00` |

El mes del primer día solo se escribe si es distinto del último ("Del lunes 30 de noviembre al miércoles 2 de diciembre"), y el año solo si no es el de `hoy` ("Martes 5 de enero de 2027"). Un bloqueo es "de días completos" cuando empieza y termina a las 00:00 hora local.

## Contrato de `crear_bloqueos`

- Los errores se lanzan con SQLSTATE P0001 (código de error de PostgreSQL para errores propios) y el mensaje es exactamente el código.
- `rango_invalido`: falta una fecha o `hasta < desde`.
- `rango_muy_largo`: `hasta - desde > 365`, así que se aceptan hasta 366 días.
- `fecha_pasada`: solo si `hasta` es anterior a hoy en la zona del negocio. Hoy se permite, y `desde` puede estar en el pasado (esos días no afectan nada).
- `motivo_largo`: más de 120 caracteres después de quitar espacios de los extremos. Un motivo vacío se guarda como `NULL`.
- El visitante sin sesión no tiene permiso de ejecutarla (error 42501).
- **Cambio de horario:** si una hora local no existe (al adelantar el reloj), PostgreSQL la corre una hora adelante. Si así la franja de ese día queda vacía (por ejemplo, 02:00–03:00 en Nueva York el día del cambio), ese día se omite en lugar de fallar.

## Decisiones

1. **Franja diaria: una fila por día y no una regla que se repite.**
   - *Opciones:* (a) una fila por día con `serie`; (b) guardar una regla ("cada día de 14:00 a 15:00") y calcularla al leer.
   - *Elegida:* (a). La página pública, `reservar_cita`, `vista_ocupado` y la restricción de traslape ya trabajan con rangos concretos; no hubo que tocarlas. Con (b), todas habrían tenido que interpretar reglas.
   - *Límite:* un año por bloqueo, hasta 366 filas.
   - *Cómo se comprobó:* pgTAP crea una franja de 3 días y verifica 3 filas con la misma `serie`, cada una de 14:00 a 15:00 hora local. Una prueba de "lector ciego" (alguien que no vio el trabajo, solo con esta documentación) reconstruyó el cálculo de rangos y coincidió en 23 de 23 casos. Esa prueba también encontró el fallo de la hora que no existe, que ya está corregido.

2. **`crear_bloqueos` no es `security definer`.**
   - *Por qué:* el dueño tiene sesión y RLS ya le deja escribir solo en su negocio. No hace falta saltarse permisos, y así un error en la función no puede tocar otro negocio.
   - *Cómo se comprobó:* pgTAP revisa que no es definer, que otro negocio no ve los bloqueos ajenos y que el visitante no puede llamarla.

3. **Las citas que caen dentro no se cancelan solas.**
   - *Por qué:* cancelar le quita su cita a un cliente que ya reservó; esa decisión es del negocio, y es HU-15 (cancelación por el negocio, con aviso al cliente). La función devuelve `citas_afectadas` y el panel avisa "Ojo: 1 cita confirmada queda dentro…".
   - Solo cuentan las citas `confirmada` que se encimen con rangos medio abiertos `[)`: una cita que empieza justo cuando termina el bloqueo no cuenta. Las reservas nuevas en ese rato fallan con `horario_bloqueado` (`reservar_cita`).
   - *Cómo se comprobó:* pgTAP y la prueba en el navegador bloquean el día de una cita, ven el aviso y comprueban que la cita sigue confirmada.

4. **El formulario se envía con `onSubmit` y `startTransition`.**
   - *Por qué:* con `<form action={...}>`, React reinicia el formulario al terminar. El radio "Solo unas horas" se desmarcaba en el navegador aunque el estado de React dijera lo contrario, y el siguiente envío salía como "Todo el día".
   - *Cómo se comprobó:* la prueba en el navegador lo encontró. Ahora guarda una franja, envía otra con horas al revés y comprueba que sale el error y que no se crea nada. Es el mismo patrón que `formulario-servicio.tsx`.

5. **El motivo es privado.**
   - Las vistas públicas no lo exponen, y la prueba en el navegador revisa que el HTML de la página pública no lo contenga.

Fuentes:

- PostgreSQL, `AT TIME ZONE`: https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT
- React, `useActionState` y el reinicio de formularios: https://react.dev/reference/react/useActionState

## Dependencias

| Función | Usa |
| --- | --- |
| Página y acciones | `@supabase/ssr` (cliente del servidor con la sesión), `next` (`connection`, `refresh`), `react` |
| "Hoy" del negocio | `claveDia` de `lib/fechas.ts` (solo `Intl`) |
| Validación y descripciones | `lib/bloqueos.ts`, sin dependencias (solo `Intl`) |
| `crear_bloqueos` | Tablas `negocio`, `bloqueo` y `cita`; `auth.uid()` |

## Receta para reconstruirlo

1. **Migración `20261031000100_hu05_bloqueos.sql`:** columna `serie`, índice `(negocio_id, fin)` y la función `crear_bloqueos`, con `execute` solo para `authenticated`. Va primero porque la app la llama.
2. **`supabase/tests/database/05_bloqueos.test.sql`:** 32 pruebas pgTAP. Cubren los días completos, la franja, la serie, las citas afectadas, todos los errores, RLS, el horario de verano (un negocio en Nueva York, incluida la hora que no existe) y la reserva bloqueada o permitida según la franja.
3. **`lib/bloqueos.ts` y `lib/bloqueos.test.ts`:** las mismas reglas del lado de la app y las descripciones de la lista (formatos arriba).
4. **`app/panel/bloqueos/`:** página, acciones y formulario (el formulario sigue el patrón de `app/panel/disponibilidad/formulario-servicio.tsx`: `onSubmit` con `preventDefault`, `new FormData(...)` y `startTransition`). Agregar la pestaña en `app/panel/navegacion.tsx`.
5. **Verificar:**
   - `supabase db reset`, `supabase test db` y `npm test`.
   - Levanta la app con `npx supabase start` y `npm run dev`.
   - En el navegador, entra como `lupita@cupo.test` (la contraseña está en `supabase/seed.sql`), bloquea un día y una franja, revisa la página pública y quita la franja.
