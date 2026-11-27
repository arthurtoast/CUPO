// HU-19 · Lógica de la vista semanal de la agenda.
//
// Todo se calcula en la zona horaria del negocio: el día y la hora en que cae
// cada cita son los del reloj del negocio, no los del servidor ni del navegador.
// Aquí no hay React: el componente solo pinta lo que regresan estas funciones.

import { diaSemanaIso, fechaLocal, instanteLocal, sumarDias } from "./huecos.ts";

export type CitaSemana = { id: string; inicio: string; fin: string; estado: string };

export type PosicionCita<T extends CitaSemana> = {
  cita: T;
  dia: number; // 0 = lunes ... 6 = domingo
  desdeMin: number; // minutos desde las 00:00 del día local
  hastaMin: number;
  columna: number; // para las citas que se enciman (por ejemplo, una cancelada)
  columnas: number;
};

const CLAVE = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" válido (rechaza 2026-02-30 y textos raros de la URL).
export function esClaveValida(texto: string | undefined | null): texto is string {
  if (!texto || !CLAVE.test(texto)) return false;
  return sumarDias(texto, 0) === texto;
}

// Lunes de la semana a la que pertenece la fecha.
export function lunesDe(clave: string): string {
  return sumarDias(clave, 1 - diaSemanaIso(clave));
}

// Las siete fechas, de lunes a domingo.
export function diasDeLaSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

// Instantes UTC del inicio del lunes y del inicio del lunes siguiente, para
// pedir a la base solo las citas de esa semana.
export function limitesSemana(lunes: string, zona: string) {
  return {
    desde: instanteLocal(lunes, "00:00", zona),
    hasta: instanteLocal(sumarDias(lunes, 7), "00:00", zona),
  };
}

function minutosLocales(instante: Date, zona: string): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(instante)
    .split(":")
    .map(Number);
  return h! * 60 + m!;
}

// Ubica cada cita en su día y su franja. Las que se enciman se reparten en
// columnas dentro del mismo día para que no se tapen.
export function acomodarCitas<T extends CitaSemana>(
  citas: T[],
  lunes: string,
  zona: string,
): PosicionCita<T>[] {
  const dias = diasDeLaSemana(lunes);
  const posiciones: PosicionCita<T>[] = [];

  for (const cita of citas) {
    const inicio = new Date(cita.inicio);
    const fin = new Date(cita.fin);
    const dia = dias.indexOf(fechaLocal(inicio, zona));
    if (dia === -1) continue;

    const desdeMin = minutosLocales(inicio, zona);
    // Si la cita termina otro día (pasa de medianoche), se corta a las 24:00.
    const mismoDia = fechaLocal(fin, zona) === dias[dia];
    const hastaMin = mismoDia ? Math.max(minutosLocales(fin, zona), desdeMin + 1) : 24 * 60;
    posiciones.push({ cita, dia, desdeMin, hastaMin, columna: 0, columnas: 1 });
  }

  posiciones.sort((a, b) => a.dia - b.dia || a.desdeMin - b.desdeMin || a.hastaMin - b.hastaMin);

  // Por cada día, agrupa las citas que se enciman y asigna la primera columna
  // libre a cada una; el grupo entero comparte el número de columnas.
  for (let d = 0; d < 7; d++) {
    const delDia = posiciones.filter((p) => p.dia === d);
    let grupo: PosicionCita<T>[] = [];
    let finGrupo = -1;
    const cerrar = () => {
      const columnas = Math.max(1, ...grupo.map((p) => p.columna + 1));
      for (const p of grupo) p.columnas = columnas;
      grupo = [];
    };
    for (const p of delDia) {
      if (grupo.length > 0 && p.desdeMin >= finGrupo) cerrar();
      const ocupadas = new Set(
        grupo.filter((q) => q.hastaMin > p.desdeMin).map((q) => q.columna),
      );
      let columna = 0;
      while (ocupadas.has(columna)) columna++;
      p.columna = columna;
      grupo.push(p);
      finGrupo = Math.max(finGrupo, p.hastaMin);
    }
    if (grupo.length > 0) cerrar();
  }

  return posiciones;
}

// Horas que muestra la cuadrícula: de 8 a 20 por defecto, ampliadas para que
// quepan el horario de atención y todas las citas de la semana.
export function rangoHoras(
  posiciones: { desdeMin: number; hastaMin: number }[],
  horario: { hora_inicio: string; hora_fin: string }[] = [],
) {
  const minutos = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return h! * 60 + m!;
  };
  let desde = 8 * 60;
  let hasta = 20 * 60;
  for (const b of horario) {
    desde = Math.min(desde, minutos(b.hora_inicio));
    hasta = Math.max(hasta, minutos(b.hora_fin));
  }
  for (const p of posiciones) {
    desde = Math.min(desde, p.desdeMin);
    hasta = Math.max(hasta, p.hastaMin);
  }
  return { desdeHora: Math.floor(desde / 60), hastaHora: Math.min(24, Math.ceil(hasta / 60)) };
}

// "23 – 29 nov 2026" o "30 nov – 6 dic 2026".
export function etiquetaSemana(lunes: string): string {
  const domingo = sumarDias(lunes, 6);
  const mes = (clave: string) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "short" })
      .format(new Date(`${clave}T12:00:00Z`))
      .replace(".", "");
  const dia = (clave: string) => Number(clave.slice(8, 10));
  const anio = domingo.slice(0, 4);
  return lunes.slice(5, 7) === domingo.slice(5, 7)
    ? `${dia(lunes)} – ${dia(domingo)} ${mes(domingo)} ${anio}`
    : `${dia(lunes)} ${mes(lunes)} – ${dia(domingo)} ${mes(domingo)} ${anio}`;
}
