// HU-19 · Pruebas de la vista semanal (lib/semana.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acomodarCitas,
  diasDeLaSemana,
  esClaveValida,
  etiquetaSemana,
  limitesSemana,
  lunesDe,
  rangoHoras,
} from "./semana.ts";

const ZONA = "America/Monterrey"; // UTC-6 todo el año

const cita = (id: string, inicio: string, fin: string, estado = "confirmada") => ({
  id,
  inicio,
  fin,
  estado,
});

test("lunesDe regresa el lunes de la semana, incluso desde un domingo", () => {
  assert.equal(lunesDe("2026-11-25"), "2026-11-23"); // miércoles
  assert.equal(lunesDe("2026-11-23"), "2026-11-23"); // lunes
  assert.equal(lunesDe("2026-11-29"), "2026-11-23"); // domingo
  assert.equal(lunesDe("2027-01-01"), "2026-12-28"); // cruza de año
});

test("diasDeLaSemana da siete fechas seguidas", () => {
  assert.deepEqual(diasDeLaSemana("2026-11-30"), [
    "2026-11-30",
    "2026-12-01",
    "2026-12-02",
    "2026-12-03",
    "2026-12-04",
    "2026-12-05",
    "2026-12-06",
  ]);
});

test("esClaveValida rechaza fechas que no existen o con otro formato", () => {
  assert.equal(esClaveValida("2026-11-23"), true);
  assert.equal(esClaveValida("2026-02-30"), false);
  assert.equal(esClaveValida("23-11-2026"), false);
  assert.equal(esClaveValida("2026-11-23'; drop"), false);
  assert.equal(esClaveValida(undefined), false);
});

test("limitesSemana usa la medianoche del negocio, no la de UTC", () => {
  const { desde, hasta } = limitesSemana("2026-11-23", ZONA);
  assert.equal(desde.toISOString(), "2026-11-23T06:00:00.000Z");
  assert.equal(hasta.toISOString(), "2026-11-30T06:00:00.000Z");
});

test("acomodarCitas pone cada cita en su día y su hora local", () => {
  const [a] = acomodarCitas(
    [cita("a", "2026-11-25T16:00:00Z", "2026-11-25T16:45:00Z")], // miércoles 10:00-10:45
    "2026-11-23",
    ZONA,
  );
  assert.equal(a!.dia, 2);
  assert.equal(a!.desdeMin, 10 * 60);
  assert.equal(a!.hastaMin, 10 * 60 + 45);
  assert.equal(a!.columnas, 1);
});

test("una cita de noche en UTC cae en el día correcto del negocio", () => {
  // Lunes 23 a las 20:00 en Monterrey es martes 24 a las 02:00 en UTC.
  const [a] = acomodarCitas(
    [cita("a", "2026-11-24T02:00:00Z", "2026-11-24T03:00:00Z")],
    "2026-11-23",
    ZONA,
  );
  assert.equal(a!.dia, 0);
  assert.equal(a!.desdeMin, 20 * 60);
});

test("acomodarCitas ignora las citas de otra semana", () => {
  const posiciones = acomodarCitas(
    [cita("fuera", "2026-11-30T16:00:00Z", "2026-11-30T17:00:00Z")],
    "2026-11-23",
    ZONA,
  );
  assert.equal(posiciones.length, 0);
});

test("las citas que se enciman se reparten en columnas", () => {
  const posiciones = acomodarCitas(
    [
      cita("cancelada", "2026-11-25T16:00:00Z", "2026-11-25T17:00:00Z", "cancelada"),
      cita("nueva", "2026-11-25T16:30:00Z", "2026-11-25T17:30:00Z"),
      cita("despues", "2026-11-25T18:00:00Z", "2026-11-25T19:00:00Z"),
    ],
    "2026-11-23",
    ZONA,
  );
  const por = Object.fromEntries(posiciones.map((p) => [p.cita.id, p]));
  assert.equal(por.cancelada!.columna, 0);
  assert.equal(por.nueva!.columna, 1);
  assert.equal(por.cancelada!.columnas, 2);
  assert.equal(por.nueva!.columnas, 2);
  // La de las 12:00 ya no se encima: ocupa todo el ancho.
  assert.equal(por.despues!.columna, 0);
  assert.equal(por.despues!.columnas, 1);
});

test("una cita que pasa de medianoche se corta a las 24:00", () => {
  const [a] = acomodarCitas(
    [cita("tarde", "2026-11-26T05:30:00Z", "2026-11-26T06:30:00Z")], // 23:30 a 00:30
    "2026-11-23",
    ZONA,
  );
  assert.equal(a!.desdeMin, 23 * 60 + 30);
  assert.equal(a!.hastaMin, 24 * 60);
});

test("rangoHoras se amplía para que quepan el horario y las citas", () => {
  assert.deepEqual(rangoHoras([]), { desdeHora: 8, hastaHora: 20 });
  assert.deepEqual(
    rangoHoras([{ desdeMin: 7 * 60 + 30, hastaMin: 8 * 60 }], [
      { hora_inicio: "09:00:00", hora_fin: "21:30:00" },
    ]),
    { desdeHora: 7, hastaHora: 22 },
  );
});

test("etiquetaSemana junta los meses cuando la semana cruza de mes", () => {
  assert.equal(etiquetaSemana("2026-11-23"), "23 – 29 nov 2026");
  assert.equal(etiquetaSemana("2026-11-30"), "30 nov – 6 dic 2026");
});
