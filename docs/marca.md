# Marca del negocio (HU-06 y HU-07)

El negocio personaliza su página pública desde **Panel → Mi página**: sube su logo, elige su color de acento y escribe su descripción, teléfono público y dirección. El cliente ve todo eso en el encabezado de `/<slug>`.

## Qué hace cada parte

| Parte | Para qué sirve | Por qué así |
| --- | --- | --- |
| Migración `20261107000100_hu06_logos.sql` | Crea el bucket `logos` (público para leer, 2 MB, PNG/JPG/WEBP) y cuatro políticas sobre `storage.objects` | La primera carpeta de la ruta debe ser `auth.uid()`: un negocio no puede escribir en la carpeta de otro. Los límites viven en la base y no solo en la app |
| `CHECK negocio_logo_url_http` | `logo_url` solo acepta `http(s)://` | Evita que un valor como `javascript:` termine en un atributo `src` |
| `lib/marca.ts` | Valida logo, color, descripción, teléfono y dirección; calcula el contraste del color con el texto blanco | Código puro, sin dependencias, probado con `node --test` |
| `app/panel/marca/actions.ts` | Server Actions (acciones del servidor): `guardarMarca`, `subirLogo`, `quitarLogo` | Corren con la sesión del dueño: RLS limita el update a su fila y Storage a su carpeta |
| `app/panel/marca/formulario-*.tsx` | Formularios con vista previa del encabezado | El negocio ve el resultado antes de guardar |
| `components/encabezado-negocio.tsx` | Encabezado de la página pública: logo en caja fija, nombre, descripción, teléfono (`tel:`) y dirección (Google Maps) | Lo comparten la página de reserva y la vista previa del panel, así nunca se ven distintos |

## Decisiones

1. **El logo pasa por un Server Action y no se sube directo desde el navegador.**
   - *Opciones:* subir desde el navegador con el cliente de Supabase, o mandarlo al servidor.
   - *Elegida:* servidor, con `experimental.serverActions.bodySizeLimit = "3mb"` en `next.config.ts`. Así la validación y los mensajes de error son los mismos que en el resto del panel. El bucket vuelve a revisar tipo y tamaño de todos modos.

2. **Un nombre de archivo por versión** (`logo-<milisegundos>.<ext>`).
   - *Por qué:* con un nombre fijo, el navegador y la CDN seguirían mostrando el logo anterior. Después de guardar se borran los archivos viejos de la carpeta.

3. **Caja de tamaño fijo con `object-contain`.**
   - *Por qué:* el criterio pide que el logo aparezca dentro de una caja de tamaño fijo. Con `object-cover` un logo alargado se recortaría.

4. **El color se guarda siempre como `#RRGGBB` en mayúsculas.**
   - La base ya lo exige con un CHECK (T-03). En la app se acepta con o sin `#` y se normaliza.
   - Si el contraste con el texto blanco es menor a 3:1 (WCAG 1.4.11), el panel avisa pero deja guardar: es decisión del negocio.

5. **El color pinta botones, día y hora elegidos, y la selección de texto** de la página pública, por medio de la variable CSS `--acento`.

## Cómo se probó

- `supabase/tests/database/06_marca.test.sql`: 22 pruebas pgTAP. Cubren el bucket y sus límites, que un negocio suba a su carpeta y no a la de otro, que no pueda mover su logo a otra carpeta, los CHECK de color, URL, descripción, teléfono y dirección, y lo que ve el visitante.
- `lib/marca.test.ts`: 15 pruebas de validación, contraste y enlaces.
- En el navegador: subir un PNG, un GIF (rechazado) y un JPG de 3 MB (rechazado), cambiar el color y revisar la página pública desde el celular.

## Receta para reconstruirlo

1. Migración del bucket y políticas; `supabase db reset` y `supabase test db`.
2. `lib/marca.ts` y su prueba; `npm test`.
3. `components/encabezado-negocio.tsx` y usarlo en `app/[slug]/reservador.tsx`.
4. `app/panel/marca/` y el enlace "Mi página" en `app/panel/navegacion.tsx`.

Fuentes:

- Supabase, control de acceso de Storage: https://supabase.com/docs/guides/storage/security/access-control
- Supabase, `storage.foldername()`: https://supabase.com/docs/guides/storage/schema/helper-functions
- Next.js, `serverActions.bodySizeLimit`: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- WCAG 2.2, contraste de componentes (1.4.11): https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast
