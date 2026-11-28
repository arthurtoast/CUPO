// Reglas de los datos del cliente al reservar (HU-10) y textos de error.
//
// Son las mismas que valida reservar_cita en la base (T-05). Se revisan aquí
// primero para avisar al cliente sin hacer el viaje a la base, pero la base
// vuelve a validar: este archivo no es la barrera, solo la cortesía.
//
// Sin dependencias, para probarlo con `node --test`.

export const NOMBRE_MAX = 120;
export const TELEFONO_MIN = 10;
export const TELEFONO_MAX = 15;

// Igual que la expresión de la base: algo@algo.algo, sin espacios.
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type DatosCliente = {
  nombre: string;
  correo: string;
  telefono: string;
};

export type CampoCliente = keyof DatosCliente;

export type ResultadoValidacion =
  | { ok: true; datos: DatosCliente }
  | { ok: false; errores: Partial<Record<CampoCliente, string>> };

// Deja los datos como los guarda la base: nombre sin espacios en los extremos,
// correo en minúsculas y teléfono solo con dígitos.
export function normalizarDatos(entrada: {
  nombre?: unknown;
  correo?: unknown;
  telefono?: unknown;
}): DatosCliente {
  return {
    nombre: String(entrada.nombre ?? "").trim(),
    correo: String(entrada.correo ?? "").trim().toLowerCase(),
    telefono: String(entrada.telefono ?? "").replace(/[^0-9]/g, ""),
  };
}

// HU-17: valida un solo campo (el chat pide los datos de uno en uno). Normaliza
// igual que normalizarDatos y aplica las mismas reglas que validarDatos.
export function validarCampo(
  campo: CampoCliente,                                                            // aporta: cuál de los tres datos
  valor: unknown,                                                                 // aporta: lo que escribió el cliente
): { ok: true; valor: string } | { ok: false; error: string } {
  const limpio = normalizarDatos({ [campo]: valor })[campo];                      // aporta: misma limpieza que la base
  if (campo === "nombre") {                                                       // aporta: reglas del nombre
    const largo = [...limpio].length;                                             // aporta: char_length cuenta caracteres, no unidades UTF-16
    if (largo === 0) return { ok: false, error: "Escribe tu nombre." };           // aporta: vacío no
    if (largo > NOMBRE_MAX) {                                                     // aporta: tope de la base
      return { ok: false, error: `Tu nombre es muy largo (máximo ${NOMBRE_MAX} caracteres).` };
    }
  } else if (campo === "correo") {                                                // aporta: reglas del correo
    if (!limpio) return { ok: false, error: "Escribe tu correo." };               // aporta: vacío no
    if (!CORREO.test(limpio)) {                                                   // aporta: misma expresión que la base
      return { ok: false, error: "Revisa tu correo: debe verse como nombre@correo.com." };
    }
  } else {                                                                        // aporta: reglas del teléfono
    if (!limpio) return { ok: false, error: "Escribe tu teléfono." };             // aporta: vacío no
    if (limpio.length < TELEFONO_MIN || limpio.length > TELEFONO_MAX) {           // aporta: de 10 a 15 dígitos
      return { ok: false, error: `Tu teléfono debe tener de ${TELEFONO_MIN} a ${TELEFONO_MAX} dígitos.` };
    }
  }
  return { ok: true, valor: limpio };                                             // aporta: listo para guardar
}

export function validarDatos(entrada: {
  nombre?: unknown;
  correo?: unknown;
  telefono?: unknown;
}): ResultadoValidacion {
  const datos = normalizarDatos(entrada);
  const errores: Partial<Record<CampoCliente, string>> = {};
  // HU-17: las reglas viven en validarCampo para que el chat y el formulario
  // digan exactamente lo mismo.
  for (const campo of ["nombre", "correo", "telefono"] as const) {               // aporta: los tres campos en orden
    const r = validarCampo(campo, entrada[campo]);                                // aporta: misma regla que el chat
    if (!r.ok) errores[campo] = r.error;                                          // aporta: junta los errores
  }

  return Object.keys(errores).length === 0 ? { ok: true, datos } : { ok: false, errores };
}

// ---------------------------------------------------------------------------
// Errores de reservar_cita
// ---------------------------------------------------------------------------

export const CODIGOS_ERROR = [
  "negocio_no_existe",
  "servicio_invalido",
  "staff_invalido",
  "datos_invalidos",
  "horario_pasado",
  "fuera_de_horario",
  "horario_no_alineado",
  "horario_bloqueado",
  "horario_ocupado",
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number] | "desconocido";

// Errores en los que el horario elegido ya no sirve: hay que quitar la
// selección y volver a pedir los huecos libres.
export const ERRORES_DE_HORARIO: ReadonlySet<CodigoError> = new Set([
  "horario_pasado",
  "fuera_de_horario",
  "horario_no_alineado",
  "horario_bloqueado",
  "horario_ocupado",
]);

const MENSAJES: Record<CodigoError, string> = {
  negocio_no_existe: "Este negocio ya no recibe reservas en línea.",
  servicio_invalido: "Este servicio ya no está disponible. Recarga la página.",
  staff_invalido: "Esa persona ya no tiene agenda disponible. Elige con quién y vuelve a intentar.",
  datos_invalidos: "Revisa tu nombre, correo y teléfono.",
  horario_pasado: "Ese horario ya pasó. Elige otro.",
  fuera_de_horario: "Ese horario ya no está disponible. Elige otro.",
  horario_no_alineado: "Ese horario ya no está disponible. Elige otro.",
  horario_bloqueado: "Ese horario ya no está disponible. Elige otro.",
  horario_ocupado: "Ese horario se acaba de ocupar. Elige otro.",
  desconocido: "No pudimos guardar tu cita. Intenta de nuevo.",
};

// Traduce el error que devuelve supabase.rpc('reservar_cita') a un código.
// La base manda el código en el mensaje; la restricción de exclusión
// (SQLSTATE 23P01) también cuenta como horario ocupado por si llega con otro texto.
export function codigoDeError(error: { code?: string; message?: string } | null | undefined): CodigoError {
  if (!error) return "desconocido";
  const mensaje = (error.message ?? "").trim();
  const conocido = CODIGOS_ERROR.find((c) => mensaje === c);
  if (conocido) return conocido;
  if (error.code === "23P01") return "horario_ocupado";
  return "desconocido";
}

export function mensajeDeError(codigo: CodigoError): string {
  return MENSAJES[codigo];
}
