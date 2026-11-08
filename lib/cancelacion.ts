// Reglas de la cancelación con enlace (HU-13) que no dependen de la base.
//
// La base (cancelar_por_token, migración de HU-13) vuelve a validar todo; esto
// solo evita consultas inútiles y traduce los códigos de error a textos.
// Sin dependencias, para probarlo con `node --test`.

// Igual que public.cupo_token_valido: 64 hexadecimales en minúscula, que es lo
// que genera encode(gen_random_bytes(32), 'hex').
const TOKEN = /^[0-9a-f]{64}$/;

export function esTokenValido(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

export type EstadoCita = "vigente" | "cancelada" | "pasada";

// Qué se puede hacer con la cita que se abrió con el enlace.
export function estadoDeCita(
  cita: { estado: string; inicio: string | Date },
  ahora: Date,
): EstadoCita {
  if (cita.estado === "cancelada") return "cancelada";
  if (new Date(cita.inicio).getTime() <= ahora.getTime()) return "pasada";
  return "vigente";
}

export const CODIGOS_CANCELACION = ["token_invalido", "cita_ya_cancelada", "cita_pasada"] as const;

export type CodigoCancelacion = (typeof CODIGOS_CANCELACION)[number] | "desconocido";

const MENSAJES: Record<CodigoCancelacion, string> = {
  token_invalido: "Este enlace no es válido. Revisa que esté completo.",
  cita_ya_cancelada: "Esta cita ya estaba cancelada.",
  cita_pasada: "Esta cita ya pasó, así que no se puede cancelar.",
  desconocido: "No pudimos cancelar tu cita. Intenta de nuevo.",
};

// Traduce el error de supabase.rpc('cancelar_por_token'); la base manda el código
// en el mensaje.
export function codigoDeCancelacion(
  error: { message?: string } | null | undefined,
): CodigoCancelacion {
  const mensaje = (error?.message ?? "").trim();
  return CODIGOS_CANCELACION.find((c) => c === mensaje) ?? "desconocido";
}

export function mensajeDeCancelacion(codigo: CodigoCancelacion): string {
  return MENSAJES[codigo];
}

// ---------------------------------------------------------------------------
// HU-15: el negocio cancela desde su agenda (cancelar_cita_negocio)
// ---------------------------------------------------------------------------

export const CODIGOS_CANCELACION_NEGOCIO = [
  "sin_sesion",
  "cita_no_encontrada",
  "cita_ya_cancelada",
  "cita_pasada",
] as const;

export type CodigoCancelacionNegocio = (typeof CODIGOS_CANCELACION_NEGOCIO)[number] | "desconocido";

const MENSAJES_NEGOCIO: Record<CodigoCancelacionNegocio, string> = {
  sin_sesion: "Tu sesión expiró. Vuelve a entrar.",
  cita_no_encontrada: "No encontramos esa cita en tu agenda.",
  cita_ya_cancelada: "Esta cita ya estaba cancelada.",
  cita_pasada: "Esta cita ya empezó o ya pasó, así que no se puede cancelar.",
  desconocido: "No pudimos cancelar la cita. Intenta de nuevo.",
};

export function codigoDeCancelacionNegocio(
  error: { message?: string } | null | undefined,
): CodigoCancelacionNegocio {
  const mensaje = (error?.message ?? "").trim();
  return CODIGOS_CANCELACION_NEGOCIO.find((c) => c === mensaje) ?? "desconocido";
}

export function mensajeDeCancelacionNegocio(codigo: CodigoCancelacionNegocio): string {
  return MENSAJES_NEGOCIO[codigo];
}

// Nota opcional que el negocio le escribe al cliente ("me surgió una urgencia").
// Solo va en el correo; no se guarda.
export const NOTA_MAX = 300;

export function validarNota(
  valor: unknown,
): { ok: true; nota: string | null } | { ok: false; error: string } {
  const nota = typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim() : "";
  if ([...nota].length > NOTA_MAX) {
    return { ok: false, error: `El mensaje para tu cliente puede tener hasta ${NOTA_MAX} caracteres.` };
  }
  return { ok: true, nota: nota || null };
}
