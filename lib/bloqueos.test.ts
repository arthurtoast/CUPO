// HU-05 · Pruebas de bloqueos (lib/bloqueos.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparBloqueos,
  diasEntre,
  mensajeDeErrorBloqueo,
  validarBloqueo,
  type FilaBloqueo,
} from "./bloqueos.ts";

const HOY = "2026-10-31";
const ZONA = "America/Monterrey"; // UTC-6 todo el año

test("diasEntre cuenta días de calendario", () => {
  assert.equal(diasEntre("2026-11-02", "2026-11-06"), 4);
  assert.equal(diasEntre("2026-12-31", "2027-01-01"), 1);
  assert.equal(diasEntre("2026-11-06", "2026-11-02"), -4);
});

test("días completos: válido y sin horas", () => {
  const r = validarBloqueo({ desde: "2026-11-02", hasta: "2026-11-06", modo: "dias", motivo: " Vacaciones " }, HOY);
  assert.deepEqual(r, {
    ok: true,
    datos: { desde: "2026-11-02", hasta: "2026-11-06", modo: "dias", horaInicio: null, horaFin: null, motivo: "Vacaciones" },
  });
});

test("sin fecha final se toma un solo día; motivo vacío es nulo", () => {
  const r = validarBloqueo({ desde: "2026-11-02", modo: "dias", motivo: "  " }, HOY);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.datos.hasta, "2026-11-02");
    assert.equal(r.datos.motivo, null);
  }
});

test("franja diaria: necesita las dos horas y en orden", () => {
  assert.equal(validarBloqueo({ desde: "2026-11-02", hasta: "2026-11-06", modo: "franja", horaInicio: "14:00", horaFin: "15:00" }, HOY).ok, true);
  assert.equal(validarBloqueo({ desde: "2026-11-02", modo: "franja", horaInicio: "14:00" }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-11-02", modo: "franja", horaInicio: "15:00", horaFin: "14:00" }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-11-02", modo: "franja", horaInicio: "14:00", horaFin: "14:00" }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-11-02", modo: "franja", horaInicio: "25:00", horaFin: "26:00" }, HOY).ok, false);
});

test("fechas inválidas, al revés, pasadas o de más de un año", () => {
  assert.equal(validarBloqueo({ desde: "2026-02-30", modo: "dias" }, HOY).ok, false, "día que no existe");
  assert.equal(validarBloqueo({ desde: "", modo: "dias" }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-11-06", hasta: "2026-11-02", modo: "dias" }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-10-20", hasta: "2026-10-25", modo: "dias" }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-10-20", hasta: "2026-10-31", modo: "dias" }, HOY).ok, true,
    "si termina hoy todavía sirve");
  assert.equal(validarBloqueo({ desde: "2026-11-01", hasta: "2027-11-02", modo: "dias" }, HOY).ok, false,
    "366 días de diferencia ya no (igual que la base)");
  assert.equal(validarBloqueo({ desde: "2026-11-01", hasta: "2027-11-01", modo: "dias" }, HOY).ok, true,
    "365 días de diferencia sí");
});

test("motivo de más de 120 caracteres", () => {
  assert.equal(validarBloqueo({ desde: "2026-11-02", modo: "dias", motivo: "x".repeat(121) }, HOY).ok, false);
  assert.equal(validarBloqueo({ desde: "2026-11-02", modo: "dias", motivo: "ñ".repeat(120) }, HOY).ok, true);
});

test("códigos de crear_bloqueos a texto", () => {
  assert.match(mensajeDeErrorBloqueo({ message: "fecha_pasada" }), /ya pasaron/);
  assert.match(mensajeDeErrorBloqueo({ message: "horas_invalidas" }), /después/);
  assert.match(mensajeDeErrorBloqueo({ message: "otra cosa" }), /Intenta de nuevo/);
  assert.match(mensajeDeErrorBloqueo(null), /Intenta de nuevo/);
});

// Instante UTC de una hora local de Monterrey (UTC-6)
const mty = (fecha: string, hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  const [a, mes, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a!, mes! - 1, d!, h! + 6, m!)).toISOString();
};

test("agrupar: días completos, franja diaria y franja de un día", () => {
  const filas: FilaBloqueo[] = [
    { id: "v", inicio: mty("2026-11-02", "00:00"), fin: mty("2026-11-07", "00:00"), motivo: "Vacaciones", serie: null },
    ...["2026-11-10", "2026-11-11", "2026-11-12"].map((f, i) => ({
      id: `c${i}`, inicio: mty(f, "14:00"), fin: mty(f, "15:00"), motivo: "Comida", serie: "s1",
    })),
    { id: "u", inicio: mty("2026-11-16", "10:00"), fin: mty("2026-11-16", "11:00"), motivo: null, serie: null },
    { id: "d", inicio: mty("2026-11-20", "00:00"), fin: mty("2026-11-21", "00:00"), motivo: null, serie: null },
  ];
  const e = agruparBloqueos(filas, ZONA, HOY);
  assert.deepEqual(e.map((x) => x.descripcion), [
    "Del lunes 2 al viernes 6 de noviembre · Todo el día",
    "Del martes 10 al jueves 12 de noviembre · 14:00–15:00 cada día (3 días)",
    "Lunes 16 de noviembre · 10:00–11:00",
    "Viernes 20 de noviembre · Todo el día",
  ]);
  assert.deepEqual(e[1]!.ids, ["c0", "c1", "c2"]);
  assert.equal(e[1]!.serie, "s1");
  assert.equal(e[1]!.motivo, "Comida");
});

test("agrupar: rango entre meses y en otro año", () => {
  const e = agruparBloqueos(
    [
      { id: "a", inicio: mty("2026-11-30", "00:00"), fin: mty("2026-12-03", "00:00"), motivo: null, serie: null },
      { id: "b", inicio: mty("2027-01-05", "00:00"), fin: mty("2027-01-06", "00:00"), motivo: null, serie: null },
    ],
    ZONA,
    HOY,
  );
  assert.equal(e[0]!.descripcion, "Del lunes 30 de noviembre al miércoles 2 de diciembre · Todo el día");
  assert.equal(e[1]!.descripcion, "Martes 5 de enero de 2027 · Todo el día");
});

test("agrupar: una serie de la que ya pasaron días muestra solo lo que queda", () => {
  const e = agruparBloqueos(
    [{ id: "c2", inicio: mty("2026-11-12", "14:00"), fin: mty("2026-11-12", "15:00"), motivo: null, serie: "s1" }],
    ZONA,
    HOY,
  );
  assert.equal(e[0]!.descripcion, "Jueves 12 de noviembre · 14:00–15:00");
});
