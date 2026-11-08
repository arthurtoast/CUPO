# Cancelación con el enlace (HU-13)

El cliente reserva sin cuenta (HU-10). Para que pueda cancelar sin contraseña, cada cita tiene un token aleatorio. Ese token va en el correo de confirmación (HU-12) y en la pantalla de confirmación, dentro del enlace `/cancelar/<token>`.

## Qué hace cada parte

| Parte | Para qué sirve | Por qué así |
| --- | --- | --- |
| `cupo_token_valido(token)` (SQL) | Revisa que el texto tenga forma de token: 64 hexadecimales en minúscula | Descarta basura antes de buscar en la tabla |
| `cita_por_token(token)` (SQL) | Da el resumen de la cita (fecha, servicio, negocio, estado) | El visitante no puede leer la tabla `cita` (RLS: seguridad por fila), y esta función solo expone lo necesario: nunca el correo, el teléfono ni el token |
| `cancelar_por_token(token)` (SQL) | Pasa la cita a `cancelada` | Es la única puerta para cancelar sin sesión. Valida, bloquea la fila y cambia el estado en una sola transacción |
| `lib/cancelacion.ts` | Valida el token, decide si la cita está vigente, cancelada o pasada, y traduce los códigos de error a textos | Es código puro, sin dependencias, y se prueba con `node --test` |
| `app/cancelar/[token]/page.tsx` | Muestra la cita y, si está vigente, el botón para cancelar | Corre en el servidor y en cada petición, porque el estado depende de la hora actual |
| `app/cancelar/[token]/actions.ts` | Server Action (acción del servidor) que llama a `cancelar_por_token` | Cancelar requiere un POST (el botón), nunca un GET (abrir el enlace) |
| `app/cancelar/[token]/formulario-cancelar.tsx` | Botón con estado de envío y mensaje final | Componente de cliente con `useActionState` (hook de React para formularios), igual que el de reserva |

## Decisiones

1. **Cancelar con botón, no al abrir el enlace.**
   - *Opciones:* cancelar al cargar la página (GET) o pedir confirmación (POST).
   - *Elegida:* POST con botón. Los filtros antispam y las vistas previas de WhatsApp o Slack abren los enlaces solos: con GET, la cita se cancelaría sin que nadie lo pidiera. Además, el criterio de HU-13 dice "cuando el cliente abre el enlace **y confirma**".
   - *Cómo se comprobó:* la prueba en navegador abre el enlace y revisa en la base que la cita siga `confirmada`.

2. **Mismo mensaje para un token mal escrito y uno que no existe.**
   - *Por qué:* así nadie puede usar la página para saber si un token existe.
   - *Cómo se comprobó:* pgTAP (`cita_por_token` regresa cero filas en ambos casos) y la prueba en navegador ("No encontramos tu cita" en los dos).

3. **`for update` en `cancelar_por_token`.**
   - *Por qué:* con dos clics o dos pestañas, la segunda llamada espera a la primera y ve la cita ya cancelada. Nunca hay dos cambios.
   - *Cómo se comprobó:* la prueba en navegador cancela desde dos pestañas a la vez y las dos terminan en "Tu cita quedó cancelada". En pgTAP, la segunda cancelación da `cita_ya_cancelada`.

4. **Una cita que ya empezó no se cancela.**
   - *Por qué:* el criterio dice "cita confirmada **futura**", y cancelar a medias confundiría la agenda del negocio. La misma regla (`inicio <= ahora` significa pasada) está en la base y en `lib/cancelacion.ts`.

5. **La cita no se borra** (regla de integridad 4).
   - Cambian `estado` y `cancelada_en`. El negocio la ve tachada en su agenda.
   - El horario se libera solo, porque `cita_sin_traslape` y `vista_ocupado` solo cuentan las confirmadas.

6. **La página no se indexa ni filtra el token.**
   - `robots: noindex` para que los buscadores no la guarden.
   - `referrer: no-referrer` para que el token no viaje en el encabezado Referer (la dirección de origen que el navegador manda) si la persona sigue un enlace hacia otro sitio.

Fuentes:

- PostgreSQL, `SELECT … FOR UPDATE` (bloqueo de filas): https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
- Next.js, Server Actions y `useActionState`: https://nextjs.org/docs/app/getting-started/updating-data

## Dependencias

| Función | Usa |
| --- | --- |
| Página y acción | `@supabase/ssr` (cliente del servidor), `next` (`connection`, metadatos), `react` (`Suspense`, `useActionState`) |
| Formato de la fecha | `fechaDeCita` de `lib/correos.ts`, que solo usa `Intl` |
| Validación y textos | `lib/cancelacion.ts`, sin dependencias |
| Funciones SQL | Tablas `cita`, `negocio` y `servicio`, y el trigger `cita_transicion_estado` (T-04) |

## Receta para reconstruirlo

1. **Migración `20261028000100_hu13_cancelar_por_token.sql`:** crear las tres funciones `security definer` con `search_path` vacío. Dar `execute` solo a `anon` y `authenticated`. Va primero porque todo lo demás la llama.
2. **`supabase/tests/database/04_cancelar_por_token.test.sql`:** 25 pruebas pgTAP. Cubren el formato del token, lo que se expone, los tres errores, la doble cancelación, que el hueco se libere y que la cita no se borre.
3. **`lib/cancelacion.ts` y su prueba:** las mismas reglas del lado de la app, para no consultar en vano y para mostrar textos claros.
4. **`app/cancelar/[token]/`:** la página (lectura con `cita_por_token`), la acción (`cancelar_por_token`) y el formulario.
5. **Verificar:**
   - `supabase db reset`, `supabase test db` y `npm test`.
   - En el navegador, reserva en `/estetica-lupita`, copia el enlace de la confirmación, ábrelo, cancela, y comprueba que el horario vuelva a aparecer libre.

# Cancelación por el negocio (HU-15)

El negocio puede cancelar una cita confirmada que todavía no empieza desde su agenda (**Panel → Agenda → Cancelar cita**). El cliente recibe un correo con la fecha que tenía, un mensaje opcional del negocio y un botón para elegir otro horario.

## Qué hace cada parte

| Parte | Para qué sirve | Por qué así |
| --- | --- | --- |
| `cancelar_cita_negocio(cita_id)` (SQL) | Pasa la cita a `cancelada` y regresa nombre, correo, servicio y duración para el correo | Corre como quien llama (`security invoker`): RLS hace que el negocio solo encuentre sus citas. Una cita de otro negocio da el mismo error que una que no existe |
| `lib/cancelacion.ts` | Traduce los códigos de error y valida la nota opcional (300 caracteres) | Sin dependencias, probado con `node --test` |
| `lib/correos.ts` (`avisoCancelacionPorNegocio`) | Arma el correo al cliente | Mismo formato que los correos de HU-12; la nota se escapa en el HTML |
| `app/panel/actions.ts` | Server Action que llama a la función y manda el correo con `after()` | La agenda se actualiza sin esperar al servidor de correo |
| `app/panel/cancelar-cita.tsx` | Botón con confirmación dentro de la tarjeta | Evita cancelar por un toque accidental, sin ventanas del navegador |

## Decisiones

1. **Misma regla que HU-13:** solo se cancela una cita confirmada y futura. La cita no se borra y el horario se libera solo.
2. **`for update`** en la función: si el negocio y el cliente cancelan al mismo tiempo, el segundo ve `cita_ya_cancelada` y no hay dos cambios ni dos correos.
3. **La nota no se guarda.** Es un mensaje para el cliente y solo viaja en el correo; así no se acumulan datos que nadie consulta.
4. **Responder al correo le escribe al negocio** (correo de contacto o, si no hay, el de su cuenta).

## Cómo se probó

- `supabase/tests/database/07_cancelar_por_negocio.test.sql`: 20 pruebas pgTAP. Cubren sin sesión, cita de otro negocio, cita inexistente, cita pasada, doble cancelación, los datos que regresa, que el horario se libere y se pueda volver a reservar, y que la cita no se borre.
- `lib/cancelacion.test.ts` y `lib/correos.test.ts`: códigos de error, nota opcional y contenido del correo.
