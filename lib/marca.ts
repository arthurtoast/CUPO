// Marca del negocio (HU-06 y HU-07): logo, color de acento, descripción y
// datos de contacto que ve el cliente en la página pública.
//
// La base vuelve a validar todo (CHECK de negocio y límites del bucket "logos");
// esto solo avisa antes con textos claros. Sin dependencias, para probarlo con
// `node --test`.

// ---------------------------------------------------------------------------
// Logo (HU-06)
// ---------------------------------------------------------------------------

export const BUCKET_LOGOS = "logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB, igual que el bucket

// Tipo de archivo y extensión con la que se guarda. Igual que allowed_mime_types
// del bucket (migración de HU-06).
export const TIPOS_LOGO = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type TipoLogo = keyof typeof TIPOS_LOGO;

export const ACEPTA_LOGO = Object.keys(TIPOS_LOGO).join(",");

export type ResultadoLogo =
  | { ok: true; tipo: TipoLogo; extension: string }
  | { ok: false; error: string };

export function validarLogo(archivo: { type?: string; size?: number } | null | undefined): ResultadoLogo {
  if (!archivo || !archivo.size) {
    return { ok: false, error: "Elige una imagen para tu logo." };
  }
  const tipo = (archivo.type ?? "").toLowerCase();
  if (!(tipo in TIPOS_LOGO)) {
    return { ok: false, error: "El logo debe ser PNG, JPG o WEBP." };
  }
  if (archivo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "El logo pesa más de 2 MB. Usa una imagen más ligera." };
  }
  return { ok: true, tipo: tipo as TipoLogo, extension: TIPOS_LOGO[tipo as TipoLogo] };
}

// Ruta dentro del bucket. La primera carpeta es el id del negocio: las políticas
// de Storage solo dejan escribir ahí al dueño. Un nombre por versión evita que el
// navegador o la CDN sigan mostrando el logo anterior.
export function rutaLogo(negocioId: string, extension: string, version: number): string {
  return `${negocioId}/logo-${version}.${extension}`;
}

// ---------------------------------------------------------------------------
// Color de acento (HU-06)
// ---------------------------------------------------------------------------

export const COLOR_POR_DEFECTO = "#2B5CE6";

const HEX = /^#[0-9a-f]{6}$/i;

export function esColorValido(color: unknown): color is string {
  return typeof color === "string" && HEX.test(color);
}

// "#2b5ce6" y "2B5CE6" se guardan igual: "#2B5CE6".
export function normalizarColor(color: unknown): string | null {
  if (typeof color !== "string") return null;
  const limpio = color.trim();
  const conGato = limpio.startsWith("#") ? limpio : `#${limpio}`;
  return HEX.test(conGato) ? conGato.toUpperCase() : null;
}

// Luminancia relativa (WCAG 2.x) de un color #RRGGBB.
function luminancia(color: string): number {
  const canal = (i: number) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

// Contraste entre el acento y el texto blanco de los botones (1 a 21).
export function contrasteConBlanco(color: string): number {
  return 1.05 / (luminancia(color) + 0.05);
}

// Por debajo de 3:1 el texto blanco de los botones casi no se lee (WCAG 1.4.11).
// No se impide guardar: solo se avisa en el panel.
export function acentoPocoLegible(color: string): boolean {
  return esColorValido(color) && contrasteConBlanco(color) < 3;
}

// ---------------------------------------------------------------------------
// Descripción y contacto (HU-07)
// ---------------------------------------------------------------------------

// Igual que los CHECK de la tabla negocio (migración T-03).
export const DESCRIPCION_MAX = 280;
export const TELEFONO_MAX = 30;
export const DIRECCION_MAX = 200;

// Dígitos, espacios, +, guiones, puntos y paréntesis: "81 1234 5678", "+52 (81) 1234-5678".
const TELEFONO = /^\+?[0-9 ()\-.]+$/;

export type DatosMarca = {
  color: string;
  descripcion: string | null;
  telefono: string | null;
  direccion: string | null;
};

export type CampoMarca = keyof DatosMarca;

export type ResultadoMarca =
  | { ok: true; datos: DatosMarca }
  | { ok: false; errores: Partial<Record<CampoMarca, string>> };

// Quita espacios de más y deja los saltos de línea de la descripción en uno.
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim() : "";
}

export function validarMarca(entrada: {
  color?: unknown;
  descripcion?: unknown;
  telefono?: unknown;
  direccion?: unknown;
}): ResultadoMarca {
  const errores: Partial<Record<CampoMarca, string>> = {};

  const color = normalizarColor(entrada.color);
  if (!color) errores.color = "Elige un color válido, por ejemplo #2B5CE6.";

  const descripcion = texto(entrada.descripcion).replace(/\n{3,}/g, "\n\n");
  if ([...descripcion].length > DESCRIPCION_MAX) {
    errores.descripcion = `La descripción puede tener hasta ${DESCRIPCION_MAX} caracteres.`;
  }

  const telefono = texto(entrada.telefono).replace(/\n/g, " ");
  if (telefono) {
    const digitos = telefono.replace(/\D/g, "").length;
    if (telefono.length > TELEFONO_MAX || !TELEFONO.test(telefono) || digitos < 7 || digitos > 15) {
      errores.telefono = "Escribe un teléfono válido, por ejemplo 81 1234 5678.";
    }
  }

  const direccion = texto(entrada.direccion).replace(/\n/g, " ");
  if ([...direccion].length > DIRECCION_MAX) {
    errores.direccion = `La dirección puede tener hasta ${DIRECCION_MAX} caracteres.`;
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      color: color!,
      descripcion: descripcion || null,
      telefono: telefono || null,
      direccion: direccion || null,
    },
  };
}

// Enlace tel: a partir del teléfono que escribió el negocio.
export function enlaceTelefono(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, "")}`;
}

// Enlace a Google Maps con la dirección; abre la app de mapas en el celular.
export function enlaceMapa(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}
