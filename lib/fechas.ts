// Fechas en la zona horaria del negocio (negocio.zona_horaria). La base guarda
// instantes en UTC; aquí se convierten a la hora de pared del negocio, nunca a
// la del servidor ni a la del navegador.

// "2026-10-23": clave del día local; en-CA da año-mes-día y se compara como texto.
export function claveDia(instante: Date, zona: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

// "09:00", en 24 h como el resto del panel.
export function formatearHora(instante: Date, zona: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instante);
}

// Mediodía UTC de una clave: un instante que cae en ese día en cualquier zona
// al formatearlo con timeZone "UTC", sin depender del cambio de horario.
function mediodia(clave: string) {
  const [anio, mes, dia] = clave.split("-").map(Number);
  return new Date(Date.UTC(anio!, mes! - 1, dia!, 12));
}

function sumarDias(clave: string, dias: number) {
  const fecha = mediodia(clave);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// "Hoy", "Mañana" o "jueves 23 de octubre" (con el año si no es el actual).
export function etiquetaDia(clave: string, hoy: string) {
  if (clave === hoy) return "Hoy";
  if (clave === sumarDias(hoy, 1)) return "Mañana";

  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(mediodia(clave));
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value;

  const texto = `${parte("weekday")} ${parte("day")} de ${parte("month")}`;
  return clave.slice(0, 4) === hoy.slice(0, 4) ? texto : `${texto} de ${clave.slice(0, 4)}`;
}

// Agrupa por día local, conservando el orden en que llegan (ya ordenados por inicio).
export function agruparPorDia<T extends { inicio: string }>(elementos: T[], zona: string) {
  const grupos = new Map<string, T[]>();
  for (const elemento of elementos) {
    const clave = claveDia(new Date(elemento.inicio), zona);
    grupos.set(clave, [...(grupos.get(clave) ?? []), elemento]);
  }
  return [...grupos].map(([clave, items]) => ({ clave, items }));
}
