# Chat que agenda (HU-17)

En la página pública, debajo del encabezado, el botón **Agendar por chat** abre una conversación que guía al cliente paso a paso:

1. **Con quién**, si el negocio tiene staff.
2. **Día** y **hora**.
3. **Nombre**, **correo** y **teléfono**.
4. **Confirmar**.

La cita se crea con la misma acción que el formulario, así que se aplican las mismas validaciones, `reservar_cita` y el mismo correo de confirmación. Si el chat no entiende o no sabe algo, da el teléfono público del negocio.

## Qué hace cada parte

| Parte | Archivo | Qué hace |
| --- | --- | --- |
| Conversación | `lib/chat.ts` | Máquina de estados sin dependencias: qué preguntar en cada paso, cómo entender días y horas escritos, preguntas comunes y la traducción de la respuesta de la base |
| Pruebas | `lib/chat.test.ts` | 18 pruebas (las de cada decisión, abajo) |
| Validación por campo | `lib/reserva.ts` → `validarCampo` | Las reglas de nombre, correo y teléfono en un solo lugar. `validarDatos` (el formulario) ahora la usa también |
| Pantalla | `app/[slug]/chat-reserva.tsx` | Dibuja el chat, manda a `reservar` y muestra el enlace para cancelar |
| Datos | `app/[slug]/page.tsx` | Calcula los días libres de cada persona (`opciones`) con el mismo `calcularDias` que usa la página |
| Lugar en la página | `app/[slug]/reservador.tsx` | Recibe el chat por la propiedad `chat` y lo pone debajo del encabezado |
| Acción | `app/[slug]/actions.ts` → `reservar` | La misma del formulario. Al terminar hace `refresh()`, y por eso el chat recibe los días ya actualizados |

## Pasos de la conversación

```
staff ──► dia ──► hora ──► nombre ──► correo ──► telefono ──► confirmar ──sí──► enviando ──► listo
  (solo con     ▲  "otro día" │                                  │no
   2+ personas) └─────────────┘                                  ▼
                                                    cambiar: horario | datos | persona
```

- **Saltos al iniciar:** sin horarios libres, `sin_horarios`, con el teléfono. Con una sola opción con lugar (negocio sin staff o una sola persona con horarios), directo a `dia`.
- **`editando`:** se activa al elegir "cambiar horario" o "cambiar persona", o cuando la base rechaza la hora. Si ya tenía los tres datos, al elegir la nueva hora salta directo a `confirmar` sin volver a pedirlos.
- **`soloUno`:** se activa con "cambiar mi correo" (o nombre, o teléfono), o cuando la base rechaza un dato. Pide solo ese dato y regresa al resumen. "Mis datos" (`cambiar datos`) pide los tres en orden.
- **Si la base rechaza la hora** (`horario_ocupado` u otro de `ERRORES_DE_HORARIO`): vuelve a `dia` con `editando`, conservando los datos. Si ya no queda ningún día con lugar, pasa a `sin_horarios`.
- **Volver a empezar:** "empezar", "reiniciar", "de nuevo", "otra vez" o "agendar otra" reinician el chat en cualquier paso.

## Contrato de `lib/chat.ts`

- **`iniciar(ctx)`:** saludo y primera pregunta.
- **`responder(ctx, estado, entrada)`:** avanza con lo escrito o con el `valor` de un botón. Regresa un `Turno`: `estado`, `mensajes`, `botones`, y opcionalmente `enviar` y `enlaceCancelar`.
- **`alReservar(ctx, estado, resultado)`:** traduce lo que regresó la acción `reservar`.
  - `reservada`: paso `listo` y el enlace para cancelar.
  - Error de horario (`ERRORES_DE_HORARIO`): vuelve a `dia` conservando los datos.
  - `staff_invalido`: vuelve a `staff`.
  - Error en un dato: lo vuelve a pedir.
  - Otro error: se queda en `confirmar` y da el teléfono.
- **`ctx.opciones`:** una entrada `{ staff, dias }` por persona, o una sola con `staff: null` si el negocio no tiene staff. Los `dias` son la salida de `calcularDias` con `ocupadosPara(ocupados, staffId)`, igual que la página.
- **`ctx.maxDias`:** cuántos días se ofrecen como botones (7 por defecto). Los días escritos ("el 12") se buscan en todos los días calculados.
- **`entenderDia(texto, dias): Dia | null | "fuera"`:** recibe todos los días calculados, también los que no tienen lugar, para poder decir "ese día ya no hay". `null` = no habló de un día. `"fuera"` = fecha que existe pero no está en el rango.
- **`entenderHora(texto, huecos): Hueco[] | null`:** recibe **solo los huecos libres** del día (los filtra `responder`). `null` = no escribió una hora válida. `[]` = hora válida sin lugar. Si regresa más de uno, el chat pregunta cuál.
- **Valor de los botones:** persona → `id` del staff; día → `fecha` (`YYYY-MM-DD`); hora → `inicio` (ISO en UTC, lo que recibe `reservar_cita`); confirmar → `si` / `no`; cambiar → `cambiar horario`, `cambiar datos` o `cambiar persona`.

**Qué entiende al escribir.** Antes de comparar, todo se normaliza: minúsculas, sin acentos y sin `¿?¡!,;"`.

| Paso | Entiende |
| --- | --- |
| Con quién | El nombre completo o su inicio ("be" → Beto) |
| Día | En este orden: el valor de un botón, "pasado mañana", "mañana" (no "de la mañana"), "hoy", una fecha ("3", "3 de diciembre", "3/12"; el primer día calculado con ese número) y el nombre del día ("viernes", el próximo). Por eso "viernes 4" usa el 4. Una fecha que no existe ("31/02", "45") no se entiende. Una que existe pero está fuera del rango responde "Solo puedo agendar hasta…" |
| Hora | El valor de un botón, o una hora en cualquier parte del texto: "10", "a las 10:30", "10.30", "10h", "10 hrs", "11 am", "4 pm", "4 de la tarde". Sin am/pm, de 1 a 7 también prueba la tarde (4 → 4:00 o 16:00). Con am/pm la hora debe ser de 1 a 12 ("13 pm" no existe); "12 am" es medianoche. Si hay dos horas en esa hora (10:00 y 10:45), pregunta cuál. "otro día" vuelve al día |
| Confirmar | Solo confirma si **empieza** con sí, sip, claro, ok, okay, va, dale, confirmo, confirmar, correcto, de acuerdo o está bien, **y no** contiene no, nop, cambiar, cambia, cambio, espera, pero ni mejor. Así, "claro que no" o "sí pero cambia la hora" no envían la cita: pasan a "¿Qué quieres cambiar?" |
| Preguntas comunes (salvo en los pasos de datos y en "cambiar") | Teléfono o hablar con alguien → teléfono. Dónde están → dirección (o teléfono si no hay). Cuánto dura → duración. Precio o pago → "No tengo los precios" y el teléfono |

**Lo que no entiende:** responde "No te entendí…" con el teléfono, o "Por aquí solo puedo ayudarte a agendar" si el negocio no publicó teléfono, y repite la pregunta del paso sin perder lo avanzado.

## Decisiones

1. **Chat guiado sin inteligencia artificial externa.**
   - *Opciones:* (a) reglas fijas con botones y texto libre acotado; (b) un modelo de lenguaje externo.
   - *Elegida:* (a).
     - El criterio pide ofrecer **solo** los horarios libres. Con reglas, eso está garantizado, porque los botones salen de `calcularDias`. Un modelo podría inventar un horario.
     - No cuesta nada.
     - No manda los datos del cliente a un tercero.
     - Se prueba con `node --test`.
   - *Límite:* no entiende cualquier frase. Por eso todo paso tiene botones, y lo que no entiende se manda al teléfono, como pide el Issue.
   - *Cómo se comprobó:* `lib/chat.test.ts` compara los botones de hora del chat con los huecos libres de `calcularDias`. La prueba en el navegador los compara con las horas habilitadas de la página: coinciden.

2. **La cita se crea con la misma acción `reservar`.**
   - *Por qué:* así se usan las mismas validaciones, `reservar_cita` con su restricción de traslape y el mismo correo. El chat no tiene ningún camino propio a la base.
   - *Cómo se comprobó:* en el navegador, la cita aparece en la tabla `cita` y el buzón de prueba recibe el correo con el mismo enlace para cancelar que muestra el chat.

3. **Los datos se validan con `validarCampo`, compartida con el formulario.**
   - *Por qué:* el chat pide los datos de uno en uno, y con las reglas en un solo lugar, el chat y el formulario dicen exactamente lo mismo. `npm test` sigue pasando todas las pruebas de `validarDatos`.

4. **Antes de enviar, se revisa que la hora siga libre.**
   - *Por qué:* entre que el cliente eligió y confirmó, alguien pudo tomarla. Si los datos ya refrescados de la página dicen que se ocupó, el chat no envía. Si la base la rechaza (`horario_ocupado`), vuelve a ofrecer días sin perder los datos.
   - *Cómo se comprobó:*
     - Prueba "si el horario se ocupó mientras confirmaba".
     - En el navegador, se insertó una cita en la misma hora antes de confirmar: el chat no duplicó y pidió elegir otra.

5. **La entrada al chat va en el flujo de la página, no flotando.**
   - *Por qué:* un botón flotante tapaba horas en celulares y podía estorbar en las pruebas E2E del CI.
   - *Límite:* el chat va dentro del `Reservador`. Si el cliente cambia de persona con el selector de la página, la conversación se reinicia.

6. **Un "sí" con duda no confirma.**
   - *Por qué:* confirmar crea una cita real y manda un correo. La prueba del lector ciego encontró que "claro que no" confirmaba, porque solo se revisaba el inicio del texto. Ahora cualquier negación o "pero" lleva a "cambiar".
   - *Cómo se comprobó:* prueba "un sí con negación o duda no confirma".

7. **El formulario del chat usa `noValidate`.**
   - *Por qué:* en el paso del correo el campo es `type="email"`, y el navegador frenaba el envío con su propio aviso. Con `noValidate`, el chat explica qué corregir con el mismo texto que el formulario.

## Dependencias

| Función | Usa |
| --- | --- |
| `lib/chat.ts` | Solo `Intl` (fechas en español) y `lib/reserva.ts` (reglas y mensajes) |
| `chat-reserva.tsx` | `react` (`useActionState`, `startTransition`), la acción `reservar`, `BotonCopiar` |
| Días por persona | `calcularDias` (`lib/huecos.ts`) y `ocupadosPara` (`lib/staff.ts`) |

## Receta para reconstruirlo

1. **`validarCampo` en `lib/reserva.ts`:** sacar de `validarDatos` la regla de cada campo y hacer que `validarDatos` la llame. Va primero porque el chat la necesita y las pruebas de siempre comprueban que nada cambió.
2. **`lib/chat.ts` y sus pruebas:**
   - Tipos: `ContextoChat`, `EstadoChat`, `Turno`.
   - Funciones: `normalizar`, `preguntar` (un `case` por paso), `iniciar`, `entenderDia`, `entenderHora`, `responder` y `alReservar`.
   - Pruebas con un `calcularDias` de fecha fija (lunes 30 de noviembre de 2026, 08:00 en Monterrey) para que no caduquen.
3. **`app/[slug]/page.tsx`:** la función `diasDe(staffId)` y `opciones`. Los `dias` de la página salen de la opción elegida.
4. **`app/[slug]/chat-reserva.tsx`:**
   - `aplicar(turno)` agrega las burbujas y, si hay `enviar`, arma un `FormData` con los mismos campos que el formulario y llama a la acción con `startTransition`.
   - El resultado se procesa con el patrón "comparar con el último visto" (igual que en `reservador.tsx`).
   - Campo de texto con `autoComplete` e `inputMode` según el paso, y formulario con `noValidate`.
5. **`reservador.tsx`:** la propiedad `chat`, que se pinta después del encabezado.
6. **Verificar:**
   - `npm test`, `npm run lint` y `next build`.
   - Abre `/estetica-lupita`, entra a **Agendar por chat**, reserva y revisa la agenda.
   - Escribe "¿cuánto cuesta?": debe dar el teléfono.
