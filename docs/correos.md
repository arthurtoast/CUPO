# Correos

Cada vez que alguien reserva (HU-12) salen dos correos:

| Para | Contenido | Responder le escribe a |
| --- | --- | --- |
| Cliente | Fecha, hora, servicio, negocio, dirección, teléfono y el enlace `/cancelar/<token>` | El negocio |
| Negocio | Fecha, hora, servicio, nombre, correo y teléfono del cliente, y enlace a la agenda | El cliente |

El aviso al negocio va a `negocio.correo_contacto`; si está vacío, al correo de la cuenta del dueño. El enlace de cancelación solo lo recibe el cliente, y también aparece en su pantalla de confirmación por si el correo no llega.

## Cómo funciona

```
app/[slug]/actions.ts   reservar_cita → responde al cliente → after(): notificarCitaNueva
app/[slug]/notificar.ts lee marca y servicio (vistas públicas) y el correo del dueño (llave secreta)
lib/correos.ts          arma asunto, texto y HTML (sin dependencias)
lib/config-correo.ts    lee y valida las variables SMTP (sin dependencias)
lib/enviar-correo.ts    envía por SMTP con nodemailer
lib/supabase/admin.ts   cliente con SUPABASE_SECRET_KEY, solo servidor
```

- Los correos salen **después** de responder (`after()`), así el cliente no espera al servidor de correo.
- Si el correo falla o no está configurado, **la cita queda guardada igual**. El error se escribe en la consola del servidor, sin el contenido del correo.
- Si no hay `SMTP_HOST`, la pantalla de confirmación no dice "te enviamos un correo".

## Variables de entorno

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `SMTP_HOST` | Servidor SMTP. Sin ella no se envía nada | — |
| `SMTP_PORT` | Puerto | `587` |
| `SMTP_SECURE` | `true` para TLS desde el inicio (puerto 465) | `false` |
| `SMTP_USER`, `SMTP_PASS` | Credenciales (van juntas) | sin credenciales |
| `CORREO_REMITENTE` | Remitente, p. ej. `Cupo <no-responder@tudominio.com>` | `Cupo <no-responder@cupo.local>` |
| `SMTP_TIMEOUT_MS` | Espera máxima al servidor (1000 a 120000) | `10000` |
| `CUPO_URL_PUBLICA` | Base de los enlaces de los correos | la dirección con la que se abrió la página |
| `SUPABASE_SECRET_KEY` | Leer el correo del dueño. Sin ella solo sale el correo al cliente | — |

`SUPABASE_SECRET_KEY` se salta RLS: va solo en el servidor y nunca en una variable `NEXT_PUBLIC_`.

## Probar en local

`supabase/config.toml` expone el SMTP del buzón de prueba en el puerto 54325.

```bash
npx supabase start
npx supabase status -o env       # copia SECRET_KEY a SUPABASE_SECRET_KEY en .env.local
```

En `.env.local`:

```
SMTP_HOST=127.0.0.1
SMTP_PORT=54325
SUPABASE_SECRET_KEY=<SECRET_KEY>
```

Reserva en `/estetica-lupita` y abre http://127.0.0.1:54324: ahí aparecen los dos correos. Si cambiaste `config.toml`, corre `npx supabase stop` y `npx supabase start` para que tome el puerto.

## Producción

Cualquier proveedor SMTP sirve (Gmail con contraseña de aplicación, Outlook, Brevo, Amazon SES, etc.). Se configuran las mismas variables en el panel del hosting. Para que los correos no caigan en spam, el dominio de `CORREO_REMITENTE` debe tener SPF y DKIM del proveedor.
