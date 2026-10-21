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

export function validarDatos(entrada: {
  nombre?: unknown;
  correo?: unknown;
  telefono?: unknown;
}): ResultadoValidacion {
  const datos = normalizarDatos(entrada);
  const errores: Partial<Record<CampoCliente, string>> = {};

  // char_length de Postgres cuenta caracteres, no unidades UTF-16.
  const largoNombre = [...datos.nombre].length;
  if (largoNombre === 0) {
    errores.nombre = "Escribe tu nombre.";
  } else if (largoNombre > NOMBRE_MAX) {
    errores.nombre = `Tu nombre es muy largo (máximo ${NOMBRE_MAX} caracteres).`;
  }

  if (!datos.correo) {
    errores.correo = "Escribe tu correo.";
  } else if (!CORREO.test(datos.correo)) {
    errores.correo = "Revisa tu correo: debe verse como nombre@correo.com.";
  }

  if (!datos.telefono) {
    errores.telefono = "Escribe tu teléfono.";
  } else if (datos.telefono.length < TELEFONO_MIN || datos.telefono.length > TELEFONO_MAX) {
    errores.telefono = `Tu teléfono debe tener de ${TELEFONO_MIN} a ${TELEFONO_MAX} dígitos.`;
  }

  return Object.keys(errores).length === 0 ? { ok: true, datos } : { ok: false, errores };
}

// ---------------------------------------------------------------------------
// Errores de reservar_cita
// ---------------------------------------------------------------------------

export const CODIGOS_ERROR = [
  "negocio_no_existe",
  "servicio_invalido",
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
