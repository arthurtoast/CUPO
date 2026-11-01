// Bloqueos del negocio (HU-05): validación del formulario, textos de error y
// cómo se muestran en el panel. La base (crear_bloqueos) vuelve a validar todo;
// esto solo avisa antes y arma las descripciones.
// Sin dependencias (solo Intl), para probarlo con `node --test`.

export const MOTIVO_MAX = 120;
export const DIAS_MAX = 366; // igual que crear_bloqueos: hasta - desde <= 365

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ModoBloqueo = "dias" | "franja";

export type DatosBloqueo = {
  desde: string; // YYYY-MM-DD, día local del negocio
  hasta: string;
  modo: ModoBloqueo;
  horaInicio: string | null; // HH:MM; null en modo "dias"
  horaFin: string | null;
  motivo: string | null;
};

export type ResultadoBloqueo = { ok: true; datos: DatosBloqueo } | { ok: false; error: string };

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

// Días entre dos fechas YYYY-MM-DD (hasta - desde), sin depender de la zona.
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(a2!, m2! - 1, d2!) - Date.UTC(a1!, m1! - 1, d1!)) / 86_400_000);
}

function fechaExiste(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(a!, m! - 1, d!));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m! - 1 && f.getUTCDate() === d;
}

// hoy: YYYY-MM-DD en la zona del negocio (para no bloquear el pasado).
export function validarBloqueo(
  entrada: { desde?: unknown; hasta?: unknown; modo?: unknown; horaInicio?: unknown; horaFin?: unknown; motivo?: unknown },
  hoy: string,
): ResultadoBloqueo {
  const desde = texto(entrada.desde);
  const hasta = texto(entrada.hasta) || desde;
  const modo: ModoBloqueo = entrada.modo === "franja" ? "franja" : "dias";
  const motivo = texto(entrada.motivo) || null;

  if (!FECHA.test(desde) || !FECHA.test(hasta) || !fechaExiste(desde) || !fechaExiste(hasta)) {
    return { ok: false, error: "Elige las fechas del bloqueo." };
  }
  if (diasEntre(desde, hasta) < 0) {
    return { ok: false, error: "La fecha final no puede ser antes de la inicial." };
  }
  if (diasEntre(desde, hasta) >= DIAS_MAX) {
    return { ok: false, error: "Un bloqueo puede durar hasta un año. Divídelo en partes." };
  }
  if (diasEntre(hoy, hasta) < 0) {
    return { ok: false, error: "Esas fechas ya pasaron." };
  }
  if (motivo && [...motivo].length > MOTIVO_MAX) {
    return { ok: false, error: `El motivo puede tener hasta ${MOTIVO_MAX} caracteres.` };
  }

  if (modo === "dias") {
    return { ok: true, datos: { desde, hasta, modo, horaInicio: null, horaFin: null, motivo } };
  }

  const horaInicio = texto(entrada.horaInicio);
  const horaFin = texto(entrada.horaFin);
  if (!HORA.test(horaInicio) || !HORA.test(horaFin)) {
    return { ok: false, error: "Escribe la hora de inicio y de fin, por ejemplo 14:00 y 15:00." };
  }
  if (horaFin <= horaInicio) {
    return { ok: false, error: "La hora de fin debe ser después de la de inicio." };
  }
  return { ok: true, datos: { desde, hasta, modo, horaInicio, horaFin, motivo } };
}

// ---------------------------------------------------------------------------
// Errores de crear_bloqueos
// ---------------------------------------------------------------------------

const MENSAJES: Record<string, string> = {
  sin_sesion: "Tu sesión expiró. Vuelve a entrar.",
  sin_negocio: "Primero completa el registro de tu negocio.",
  rango_invalido: "La fecha final no puede ser antes de la inicial.",
  rango_muy_largo: "Un bloqueo puede durar hasta un año. Divídelo en partes.",
  fecha_pasada: "Esas fechas ya pasaron.",
  horas_incompletas: "Escribe la hora de inicio y de fin.",
  horas_invalidas: "La hora de fin debe ser después de la de inicio.",
  motivo_largo: `El motivo puede tener hasta ${MOTIVO_MAX} caracteres.`,
};

export function mensajeDeErrorBloqueo(error: { message?: string } | null | undefined): string {
  return MENSAJES[(error?.message ?? "").trim()] ?? "No pudimos guardar el bloqueo. Intenta de nuevo.";
}

// ---------------------------------------------------------------------------
// Cómo se muestran en el panel
// ---------------------------------------------------------------------------

export type FilaBloqueo = {
  id: string;
  inicio: string;
  fin: string;
  motivo: string | null;
  serie: string | null;
};

export type EntradaBloqueo = {
  clave: string; // id del bloqueo o de la serie, para la lista de React
  ids: string[];
  serie: string | null;
  descripcion: string; // "Del lunes 2 al viernes 6 de noviembre · Todo el día"
  motivo: string | null;
  inicio: string; // para ordenar
};

function partesLocales(instante: Date, zona: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante)) {
    p[type] = value;
  }
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function restarUnDia(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! - 1)).toISOString().slice(0, 10);
}

// "lunes 2 de noviembre" (el año solo si no es el de `hoy`)
function nombreDia(fecha: string, hoy: string, conMes = true) {
  const opciones: Intl.DateTimeFormatOptions = { timeZone: "UTC", weekday: "long", day: "numeric" };
  if (conMes) opciones.month = "long";
  if (conMes && fecha.slice(0, 4) !== hoy.slice(0, 4)) opciones.year = "numeric";
  return new Intl.DateTimeFormat("es-MX", opciones)
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(/,/g, "");
}

function rangoDeDias(desde: string, hasta: string, hoy: string) {
  if (desde === hasta) return capital(nombreDia(desde, hoy));
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  return `Del ${nombreDia(desde, hoy, !mismoMes)} al ${nombreDia(hasta, hoy)}`;
}

function capital(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Agrupa las filas (ordenadas por inicio) en lo que el negocio creó: un bloqueo
// de días completos, una franja diaria (serie) o una franja de un día.
export function agruparBloqueos(filas: FilaBloqueo[], zona: string, hoy: string): EntradaBloqueo[] {
  const series = new Map<string, FilaBloqueo[]>();
  const entradas: EntradaBloqueo[] = [];

  for (const fila of filas) {
    if (fila.serie) {
      series.set(fila.serie, [...(series.get(fila.serie) ?? []), fila]);
      continue;
    }
    const ini = partesLocales(new Date(fila.inicio), zona);
    const fin = partesLocales(new Date(fila.fin), zona);
    let descripcion: string;
    if (ini.hora === "00:00" && fin.hora === "00:00") {
      descripcion = `${rangoDeDias(ini.fecha, restarUnDia(fin.fecha), hoy)} · Todo el día`;
    } else if (ini.fecha === fin.fecha) {
      descripcion = `${capital(nombreDia(ini.fecha, hoy))} · ${ini.hora}–${fin.hora}`;
    } else {
      descripcion = `${capital(nombreDia(ini.fecha, hoy))} ${ini.hora} al ${nombreDia(fin.fecha, hoy)} ${fin.hora}`;
    }
    entradas.push({ clave: fila.id, ids: [fila.id], serie: null, descripcion, motivo: fila.motivo, inicio: fila.inicio });
  }

  for (const [serie, grupo] of series) {
    const primero = grupo[0]!;
    const ultimo = grupo[grupo.length - 1]!;
    const ini = partesLocales(new Date(primero.inicio), zona);
    const finPrimero = partesLocales(new Date(primero.fin), zona);
    const finUltimo = partesLocales(new Date(ultimo.inicio), zona);
    const dias = grupo.length === 1 ? "" : ` cada día (${grupo.length} días)`;
    entradas.push({
      clave: serie,
      ids: grupo.map((f) => f.id),
      serie,
      descripcion: `${rangoDeDias(ini.fecha, finUltimo.fecha, hoy)} · ${ini.hora}–${finPrimero.hora}${dias}`,
      motivo: primero.motivo,
      inicio: primero.inicio,
    });
  }

  return entradas.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}
