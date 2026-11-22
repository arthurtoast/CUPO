// Personalización de la página pública (HU-16): imagen de portada, mensaje de
// bienvenida y enlaces a Instagram, Facebook y WhatsApp.
//
// Igual que en lib/marca.ts, la base vuelve a validar todo (CHECK de negocio y
// límites del bucket "portadas"); esto solo avisa antes con textos claros. Sin
// dependencias, para probarlo con `node --test`.

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

export const BUCKET_PORTADAS = "portadas";
export const PORTADA_MAX_BYTES = 2 * 1024 * 1024; // 2 MB, igual que el bucket

// Los mismos formatos que el logo (lib/marca.ts) y que allowed_mime_types del
// bucket "portadas". Se repiten aquí para que el archivo no tenga imports.
export const TIPOS_PORTADA = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type TipoPortada = keyof typeof TIPOS_PORTADA;
export const ACEPTA_PORTADA = Object.keys(TIPOS_PORTADA).join(",");

export type ResultadoPortada =
  | { ok: true; tipo: TipoPortada; extension: string }
  | { ok: false; error: string };

export function validarPortada(
  archivo: { type?: string; size?: number } | null | undefined,
): ResultadoPortada {
  if (!archivo || !archivo.size) {
    return { ok: false, error: "Elige una imagen para tu portada." };
  }
  const tipo = (archivo.type ?? "").toLowerCase();
  if (!(tipo in TIPOS_PORTADA)) {
    return { ok: false, error: "La portada debe ser PNG, JPG o WEBP." };
  }
  if (archivo.size > PORTADA_MAX_BYTES) {
    return { ok: false, error: "La portada pesa más de 2 MB. Usa una imagen más ligera." };
  }
  return { ok: true, tipo: tipo as TipoPortada, extension: TIPOS_PORTADA[tipo as TipoPortada] };
}

// La primera carpeta es el id del negocio: las políticas de Storage solo dejan
// escribir ahí al dueño. Un nombre por versión evita que la CDN muestre la anterior.
export function rutaPortada(negocioId: string, extension: string, version: number): string {
  return `${negocioId}/portada-${version}.${extension}`;
}

// ---------------------------------------------------------------------------
// Bienvenida y redes
// ---------------------------------------------------------------------------

// Igual que los CHECK de la migración de HU-16.
export const BIENVENIDA_MAX = 160;

const INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;
const FACEBOOK = /^([A-Za-z0-9.-]{2,80}|profile\.php\?id=[0-9]{5,20})$/;
const WHATSAPP = /^[0-9]{11,15}$/;

export type DatosPersonalizacion = {
  bienvenida: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
};

export type CampoPersonalizacion = keyof DatosPersonalizacion;

export type ResultadoPersonalizacion =
  | { ok: true; datos: DatosPersonalizacion }
  | { ok: false; errores: Partial<Record<CampoPersonalizacion, string>> };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

// Quita el esquema, "www." y "m." de un enlace pegado del navegador o la app.
function sinDominio(valor: string, dominios: string[]): string | null {
  const limpio = valor.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.)/i, "");
  const minusculas = limpio.toLowerCase();
  for (const dominio of dominios) {
    if (minusculas.startsWith(`${dominio}/`)) return limpio.slice(dominio.length + 1);
    if (minusculas === dominio) return "";
  }
  return null;
}

// "@spa.carla", "spa.carla" o "https://www.instagram.com/spa.carla/?hl=es" → "spa.carla".
export function normalizarInstagram(valor: unknown): string | null {
  let v = texto(valor);
  const ruta = sinDominio(v, ["instagram.com", "instagr.am"]);
  if (ruta !== null) v = ruta.split(/[/?#]/)[0] ?? "";
  v = v.replace(/^@/, "");
  return INSTAGRAM.test(v) ? v : null;
}

// "spa.carla.mty", "facebook.com/spa.carla.mty" o
// "https://www.facebook.com/profile.php?id=100012345678" → la parte después del dominio.
export function normalizarFacebook(valor: unknown): string | null {
  let v = texto(valor);
  const ruta = sinDominio(v, ["facebook.com", "fb.com"]);
  if (ruta !== null) {
    const perfil = ruta.match(/^profile\.php\?(?:.*&)?id=([0-9]+)/i);
    v = perfil ? `profile.php?id=${perfil[1]}` : (ruta.split(/[/?#]/)[0] ?? "");
  }
  v = v.replace(/^@/, "");
  return FACEBOOK.test(v) ? v : null;
}

// Número con lada de país, solo dígitos, como lo pide wa.me. Un número de 10
// dígitos se toma como de México (52). Acepta enlaces wa.me pegados.
export function normalizarWhatsapp(valor: unknown): string | null {
  let v = texto(valor);
  const ruta = sinDominio(v, ["wa.me", "api.whatsapp.com"]);
  if (ruta !== null) {
    const telefono = ruta.match(/phone=([0-9+]+)/i);
    v = telefono ? telefono[1]! : (ruta.split(/[/?#]/)[0] ?? "");
  }
  if (!/^\+?[0-9 ()\-.]+$/.test(v)) return null;
  let digitos = v.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (digitos.length === 10 && !v.trim().startsWith("+")) digitos = `52${digitos}`;
  return WHATSAPP.test(digitos) ? digitos : null;
}

// Cómo se le muestra al negocio el WhatsApp guardado: un número de México a 10
// dígitos ("81 1234 5678"); cualquier otro, con + y su lada.
export function whatsappParaEditar(guardado: string | null): string {
  if (!guardado) return "";
  if (/^52[0-9]{10}$/.test(guardado)) {
    const n = guardado.slice(2);
    return `${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
  }
  return `+${guardado}`;
}

export function validarPersonalizacion(entrada: {
  bienvenida?: unknown;
  instagram?: unknown;
  facebook?: unknown;
  whatsapp?: unknown;
}): ResultadoPersonalizacion {
  const errores: Partial<Record<CampoPersonalizacion, string>> = {};

  const bienvenida = texto(entrada.bienvenida);
  if ([...bienvenida].length > BIENVENIDA_MAX) {
    errores.bienvenida = `El mensaje de bienvenida puede tener hasta ${BIENVENIDA_MAX} caracteres.`;
  }

  const instagram = texto(entrada.instagram) ? normalizarInstagram(entrada.instagram) : null;
  if (texto(entrada.instagram) && !instagram) {
    errores.instagram = "Escribe tu usuario de Instagram, por ejemplo @spa.carla.";
  }

  const facebook = texto(entrada.facebook) ? normalizarFacebook(entrada.facebook) : null;
  if (texto(entrada.facebook) && !facebook) {
    errores.facebook = "Escribe tu página de Facebook, por ejemplo facebook.com/spa.carla.";
  }

  const whatsapp = texto(entrada.whatsapp) ? normalizarWhatsapp(entrada.whatsapp) : null;
  if (texto(entrada.whatsapp) && !whatsapp) {
    errores.whatsapp = "Escribe tu número de WhatsApp a 10 dígitos, por ejemplo 81 1234 5678.";
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return { ok: true, datos: { bienvenida: bienvenida || null, instagram, facebook, whatsapp } };
}

// ---------------------------------------------------------------------------
// Enlaces de la página pública
// ---------------------------------------------------------------------------

export type RedesVisibles = {
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
};

export type EnlaceRed = { red: "instagram" | "facebook" | "whatsapp"; etiqueta: string; href: string };

// Solo las redes que el negocio llenó, siempre en el mismo orden.
export function enlacesRedes(redes: RedesVisibles): EnlaceRed[] {
  const enlaces: EnlaceRed[] = [];
  if (redes.instagram) {
    enlaces.push({ red: "instagram", etiqueta: "Instagram", href: `https://www.instagram.com/${redes.instagram}/` });
  }
  if (redes.facebook) {
    enlaces.push({ red: "facebook", etiqueta: "Facebook", href: `https://www.facebook.com/${redes.facebook}` });
  }
  if (redes.whatsapp) {
    enlaces.push({ red: "whatsapp", etiqueta: "WhatsApp", href: `https://wa.me/${redes.whatsapp}` });
  }
  return enlaces;
}
