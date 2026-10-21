// T-10 · Pruebas del cálculo de huecos (lib/huecos.ts).
// Correr con: npm test
//
// Los casos usan el horario de la semilla (Estética Lupita, servicio de 45 min,
// America/Monterrey, UTC-6 todo el año) y un caso con horario de verano.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDias,
  diaSemanaIso,
  fechaLocal,
  instanteLocal,
  sumarDias,
  type BloqueHorario,
  type OpcionesHuecos,
} from "./huecos.ts";

const ZONA = "America/Monterrey";

// Lunes a jueves 09-14 y 15-19, viernes 09-14 y 15-20, sábado 10-15.
const HORARIO: BloqueHorario[] = [
  ...[1, 2, 3, 4].flatMap((d) => [
    { dia_semana: d, hora_inicio: "09:00:00", hora_fin: "14:00:00" },
    { dia_semana: d, hora_inicio: "15:00:00", hora_fin: "19:00:00" },
  ]),
  { dia_semana: 5, hora_inicio: "09:00", hora_fin: "14:00" },
  { dia_semana: 5, hora_inicio: "15:00", hora_fin: "20:00" },
  { dia_semana: 6, hora_inicio: "10:00", hora_fin: "15:00" },
];

// Lunes 26 de octubre de 2026, 08:00 en Monterrey (14:00 UTC).
const LUNES_8AM = new Date("2026-10-26T14:00:00Z");

function opciones(extra: Partial<OpcionesHuecos> = {}): OpcionesHuecos {
  return {
    horario: HORARIO,
    ocupados: [],
    duracionMin: 45,
    zonaHoraria: ZONA,
    ahora: LUNES_8AM,
    dias: 7,
    ...extra,
  };
}

function horasLibres(dia: { huecos: { hora: string; libre: boolean }[] }) {
  return dia.huecos.filter((h) => h.libre).map((h) => h.hora);
}

// ---------------------------------------------------------------------------
// Fechas y zona horaria
// ---------------------------------------------------------------------------

test("diaSemanaIso: lunes es 1 y domingo es 7", () => {
  assert.equal(diaSemanaIso("2026-10-26"), 1);
  assert.equal(diaSemanaIso("2026-10-31"), 6);
  assert.equal(diaSemanaIso("2026-11-01"), 7);
});

test("sumarDias cruza fin de mes y de año", () => {
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
});

test("instanteLocal convierte la hora de pared del negocio a UTC", () => {
  assert.equal(
    instanteLocal("2026-10-26", "09:00", ZONA).toISOString(),
    "2026-10-26T15:00:00.000Z",
  );
  assert.equal(
    instanteLocal("2026-10-26", "09:00", "UTC").toISOString(),
    "2026-10-26T09:00:00.000Z",
  );
});

test("instanteLocal respeta el horario de verano", () => {
  // Nueva York: verano UTC-4, invierno UTC-5 (cambio el 1 de noviembre de 2026).
  assert.equal(
    instanteLocal("2026-10-30", "09:00", "America/New_York").toISOString(),
    "2026-10-30T13:00:00.000Z",
  );
  assert.equal(
    instanteLocal("2026-11-02", "09:00", "America/New_York").toISOString(),
    "2026-11-02T14:00:00.000Z",
  );
});

test("fechaLocal usa el día del negocio, no el de UTC", () => {
  // 03:00 UTC del martes todavía es lunes en Monterrey.
  assert.equal(fechaLocal(new Date("2026-10-27T03:00:00Z"), ZONA), "2026-10-26");
});

// ---------------------------------------------------------------------------
// Rejilla
// ---------------------------------------------------------------------------

test("la rejilla parte de hora_inicio cada duracionMin y no se sale del bloque", () => {
  const [lunes] = calcularDias(opciones({ dias: 1 }));
  assert.equal(lunes.fecha, "2026-10-26");
  assert.equal(lunes.diaSemana, 1);
  // 09:00-14:00 con 45 min: 6 huecos (13:30 no cabe, terminaría 14:15).
  // 15:00-19:00: 5 huecos (18:45 no cabe).
  assert.deepEqual(
    lunes.huecos.map((h) => h.hora),
    ["09:00", "09:45", "10:30", "11:15", "12:00", "12:45",
     "15:00", "15:45", "16:30", "17:15", "18:00"],
  );
});

test("cada hueco trae su instante en UTC listo para reservar_cita", () => {
  const [lunes] = calcularDias(opciones({ dias: 1 }));
  assert.equal(lunes.huecos[0].inicio, "2026-10-26T15:00:00.000Z");
  assert.equal(lunes.huecos[2].inicio, "2026-10-26T16:30:00.000Z");
});

test("un hueco que termina justo en hora_fin sí cabe", () => {
  const [dia] = calcularDias(
    opciones({
      dias: 1,
      horario: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "10:30" }],
    }),
  );
  assert.deepEqual(dia.huecos.map((h) => h.hora), ["09:00", "09:45"]);
});

test("los bloques se recorren en orden aunque lleguen desordenados", () => {
  const [dia] = calcularDias(
    opciones({
      dias: 1,
      duracionMin: 60,
      horario: [
        { dia_semana: 1, hora_inicio: "15:00", hora_fin: "17:00" },
        { dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" },
      ],
    }),
  );
  assert.deepEqual(dia.huecos.map((h) => h.hora), ["09:00", "10:00", "15:00", "16:00"]);
});

test("un día sin horario (domingo) sale vacío pero aparece", () => {
  const dias = calcularDias(opciones());
  assert.equal(dias.length, 7);
  const domingo = dias.find((d) => d.diaSemana === 7)!;
  assert.equal(domingo.fecha, "2026-11-01");
  assert.deepEqual(domingo.huecos, []);
});

test("dias controla cuántos días se devuelven", () => {
  assert.equal(calcularDias(opciones({ dias: 14 })).length, 14);
  assert.equal(calcularDias(opciones({ dias: 0 })).length, 0);
});

test("duracionMin inválida lanza RangeError", () => {
  for (const mala of [0, -15, 22.5, Number.NaN]) {
    assert.throws(() => calcularDias(opciones({ duracionMin: mala })), RangeError);
  }
});

// ---------------------------------------------------------------------------
// Libres, ocupados y pasados
// ---------------------------------------------------------------------------

test("una cita ocupa exactamente su hueco: [inicio, fin) no choca con el vecino", () => {
  const [lunes] = calcularDias(
    opciones({
      dias: 1,
      // 10:30-11:15 en Monterrey
      ocupados: [{ inicio: "2026-10-26T16:30:00Z", fin: "2026-10-26T17:15:00Z" }],
    }),
  );
  const libres = horasLibres(lunes);
  assert.ok(!libres.includes("10:30"));
  const cita = lunes.huecos.find((h) => h.hora === "10:30")!;
  assert.equal(cita.pasado, false, "ocupado no es lo mismo que pasado");
  assert.ok(libres.includes("09:45"), "09:45-10:30 termina cuando empieza la cita");
  assert.ok(libres.includes("11:15"), "11:15 empieza cuando termina la cita");
});

test("un bloqueo que cruza varios huecos los ocupa todos", () => {
  const [lunes] = calcularDias(
    opciones({
      dias: 1,
      // Bloqueo de 10:00 a 12:00: toca 09:45, 10:30, 11:15 (y no 12:00).
      ocupados: [{ inicio: new Date("2026-10-26T16:00:00Z"), fin: new Date("2026-10-26T18:00:00Z") }],
    }),
  );
  assert.deepEqual(horasLibres(lunes).slice(0, 3), ["09:00", "12:00", "12:45"]);
});

test("los huecos que ya pasaron salen como no libres", () => {
  // Lunes 10:40 en Monterrey: 09:00, 09:45 y 10:30 ya empezaron.
  const [lunes] = calcularDias(
    opciones({ dias: 1, ahora: new Date("2026-10-26T16:40:00Z") }),
  );
  const noLibres = lunes.huecos.filter((h) => !h.libre).map((h) => h.hora);
  assert.deepEqual(noLibres, ["09:00", "09:45", "10:30"]);
  const pasados = lunes.huecos.filter((h) => h.pasado).map((h) => h.hora);
  assert.deepEqual(pasados, ["09:00", "09:45", "10:30"]);
});

test("un hueco que empieza justo ahora ya no se ofrece", () => {
  const [lunes] = calcularDias(
    opciones({ dias: 1, ahora: new Date("2026-10-26T15:00:00Z") }),
  );
  assert.equal(lunes.huecos[0].hora, "09:00");
  assert.equal(lunes.huecos[0].libre, false);
  assert.equal(lunes.huecos[1].libre, true);
});

test("hoy se calcula en la zona del negocio", () => {
  // Domingo 1 de noviembre 23:30 en Monterrey = lunes 05:30 UTC.
  const dias = calcularDias(
    opciones({ dias: 2, ahora: new Date("2026-11-02T05:30:00Z") }),
  );
  assert.equal(dias[0].fecha, "2026-11-01");
  assert.equal(dias[0].diaSemana, 7);
  assert.equal(dias[1].fecha, "2026-11-02");
  assert.equal(horasLibres(dias[1]).length, 11);
});

test("con horario de verano cada día usa su propio desfase", () => {
  const dias = calcularDias(
    opciones({
      zonaHoraria: "America/New_York",
      horario: [
        { dia_semana: 5, hora_inicio: "09:00", hora_fin: "10:00" },
        { dia_semana: 1, hora_inicio: "09:00", hora_fin: "10:00" },
      ],
      duracionMin: 60,
      ahora: new Date("2026-10-29T12:00:00Z"), // jueves
      dias: 5,
    }),
  );
  const viernes = dias.find((d) => d.fecha === "2026-10-30")!;
  const lunes = dias.find((d) => d.fecha === "2026-11-02")!;
  assert.equal(viernes.huecos[0].inicio, "2026-10-30T13:00:00.000Z");
  assert.equal(lunes.huecos[0].inicio, "2026-11-02T14:00:00.000Z");
});
