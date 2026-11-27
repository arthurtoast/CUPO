// HU-18 · Pruebas de lib/staff.ts. Correr con: npm test
import { test } from "node:test";                                                   // aporta: corredor de pruebas de Node
import assert from "node:assert/strict";                                            // aporta: comparaciones estrictas
import { elegirStaff, ocupadosPara, validarNombreStaff, type OcupadoConStaff } from "./staff.ts";       // aporta: lo que se prueba

const ANA = { id: "cccccccc-0000-4000-8000-0000000000a1", nombre: "Ana" };          // aporta: primera persona
const BETO = { id: "cccccccc-0000-4000-8000-0000000000a2", nombre: "Beto" };        // aporta: segunda persona

test("sin staff no hay a quién elegir", () => {
  assert.equal(elegirStaff([], ANA.id), null);                                      // aporta: negocio sin staff funciona como antes
});

test("elige a la persona del parámetro ?con=", () => {
  assert.deepEqual(elegirStaff([ANA, BETO], BETO.id), BETO);                        // aporta: id válido de este negocio
  assert.deepEqual(elegirStaff([ANA, BETO], BETO.id.toUpperCase()), BETO);          // aporta: no importan mayúsculas
});

test("parámetro ausente, mal formado o ajeno: la primera persona", () => {
  assert.deepEqual(elegirStaff([ANA, BETO], undefined), ANA);                       // aporta: sin parámetro
  assert.deepEqual(elegirStaff([ANA, BETO], "no-es-un-id"), ANA);                   // aporta: basura en la dirección
  assert.deepEqual(elegirStaff([ANA, BETO], "cccccccc-0000-4000-8000-0000000000ff"), ANA); // aporta: id de otro negocio
  assert.deepEqual(elegirStaff([ANA, BETO], ["x"]), ANA);                           // aporta: parámetro repetido (?con=a&con=b)
});

const OCUPADOS: OcupadoConStaff[] = [                                               // aporta: una cita de cada carril y un bloqueo
  { inicio: "2026-12-01T16:00:00Z", fin: "2026-12-01T17:00:00Z", staff_id: ANA.id, bloqueo: false },
  { inicio: "2026-12-01T17:00:00Z", fin: "2026-12-01T18:00:00Z", staff_id: BETO.id, bloqueo: false },
  { inicio: "2026-12-01T18:00:00Z", fin: "2026-12-01T19:00:00Z", staff_id: null, bloqueo: false },
  { inicio: "2026-12-01T20:00:00Z", fin: "2026-12-01T21:00:00Z", staff_id: null, bloqueo: true },
];

test("con Ana: sus citas y los bloqueos, no las de Beto ni las sin staff", () => {
  assert.deepEqual(ocupadosPara(OCUPADOS, ANA.id).map((o) => o.inicio),
    ["2026-12-01T16:00:00Z", "2026-12-01T20:00:00Z"]);                              // aporta: criterio: horarios libres de esa persona
});

test("sin staff: las citas sin persona y los bloqueos", () => {
  assert.deepEqual(ocupadosPara(OCUPADOS, null).map((o) => o.inicio),
    ["2026-12-01T18:00:00Z", "2026-12-01T20:00:00Z"]);                              // aporta: igual que la base (carril sin staff)
});

test("solo regresa inicio y fin", () => {
  assert.deepEqual(Object.keys(ocupadosPara(OCUPADOS, ANA.id)[0]!).sort(), ["fin", "inicio"]); // aporta: forma que espera calcularDias
});

test("nombre del staff: limpia espacios y respeta 1 a 60 caracteres", () => {
  assert.deepEqual(validarNombreStaff("  Ana   María  "), { ok: true, nombre: "Ana María" }); // aporta: espacios sobrantes fuera
  assert.equal(validarNombreStaff("   ").ok, false);                                // aporta: vacío no
  assert.equal(validarNombreStaff(null).ok, false);                                 // aporta: campo ausente
  assert.equal(validarNombreStaff("ñ".repeat(60)).ok, true);                        // aporta: 60 caracteres sí
  assert.equal(validarNombreStaff("a".repeat(61)).ok, false);                       // aporta: 61 no
});
