// Configuración del envío de correos (HU-12), leída de variables de entorno.
//
// SMTP es un protocolo estándar: sirve con cualquier proveedor (Gmail, Outlook,
// Brevo, un servidor propio) y en local con el buzón de prueba de Supabase
// (Mailpit, SMTP en 127.0.0.1:54325). No hay nada amarrado a una empresa.
//
//   SMTP_HOST         servidor; si falta, no se envían correos (y se avisa en la consola)
//   SMTP_PORT         puerto (587 por defecto; 465 suele ir con SMTP_SECURE=true)
//   SMTP_SECURE       "true" para TLS desde el inicio (puerto 465); si no, STARTTLS cuando el servidor lo ofrece
//   SMTP_USER         usuario (opcional: el buzón local no pide)
//   SMTP_PASS         contraseña o contraseña de aplicación
//   CORREO_REMITENTE  quién envía, p. ej. "Cupo <no-responder@midominio.com>"
//   SMTP_TIMEOUT_MS   cuánto esperar al servidor antes de rendirse (10000 por defecto)
//
// Sin dependencias, para probarlo con `node --test`.

export type ConfigSmtp = {
  host: string;
  port: number;
  secure: boolean;
  usuario: string | null;
  contrasena: string | null;
  remitente: string;
  timeoutMs: number;
};

export type ResultadoConfig =
  | { ok: true; config: ConfigSmtp }
  | { ok: false; motivo: "sin_configurar" }
  | { ok: false; motivo: "invalida"; error: string };

export const PUERTO_POR_DEFECTO = 587;
export const TIMEOUT_POR_DEFECTO = 10_000;
export const REMITENTE_POR_DEFECTO = "Cupo <no-responder@cupo.local>";

type Entorno = Record<string, string | undefined>;

function texto(entorno: Entorno, clave: string): string | null {
  const valor = entorno[clave]?.trim();
  return valor ? valor : null;
}

function entero(valor: string | null, porDefecto: number, min: number, max: number) {
  if (valor === null) return porDefecto;
  if (!/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  return n >= min && n <= max ? n : null;
}

export function leerConfigSmtp(entorno: Entorno): ResultadoConfig {
  const host = texto(entorno, "SMTP_HOST");
  if (!host) return { ok: false, motivo: "sin_configurar" };

  const port = entero(texto(entorno, "SMTP_PORT"), PUERTO_POR_DEFECTO, 1, 65535);
  if (port === null) return { ok: false, motivo: "invalida", error: "SMTP_PORT debe ser un número de 1 a 65535" };

  const timeoutMs = entero(texto(entorno, "SMTP_TIMEOUT_MS"), TIMEOUT_POR_DEFECTO, 1000, 120_000);
  if (timeoutMs === null) {
    return { ok: false, motivo: "invalida", error: "SMTP_TIMEOUT_MS debe ir de 1000 a 120000" };
  }

  const seguro = (texto(entorno, "SMTP_SECURE") ?? "false").toLowerCase();
  if (seguro !== "true" && seguro !== "false") {
    return { ok: false, motivo: "invalida", error: 'SMTP_SECURE debe ser "true" o "false"' };
  }

  const usuario = texto(entorno, "SMTP_USER");
  const contrasena = texto(entorno, "SMTP_PASS");
  if ((usuario === null) !== (contrasena === null)) {
    return { ok: false, motivo: "invalida", error: "SMTP_USER y SMTP_PASS van juntos" };
  }

  const remitente = texto(entorno, "CORREO_REMITENTE") ?? REMITENTE_POR_DEFECTO;
  if (!/@[^@\s>]+\.[^@\s>]+>?$/.test(remitente)) {
    return { ok: false, motivo: "invalida", error: "CORREO_REMITENTE no tiene un correo válido" };
  }

  return {
    ok: true,
    config: { host, port, secure: seguro === "true", usuario, contrasena, remitente, timeoutMs },
  };
}

// Base de los enlaces que van en los correos. CUPO_URL_PUBLICA la fija (útil
// detrás de un proxy o con dominio propio); si falta, se usa el origen de la
// petición. Siempre sin "/" al final.
export function baseDeEnlaces(entorno: Entorno, origenPeticion: string): string {
  const fija = texto(entorno, "CUPO_URL_PUBLICA");
  const base = fija && /^https?:\/\/[^\s/]+/.test(fija) ? fija : origenPeticion;
  return base.replace(/\/+$/, "");
}
