// HU-13 · Pruebas de las reglas de cancelación (lib/cancelacion.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODIGOS_CANCELACION,
  codigoDeCancelacion,
  esTokenValido,
  estadoDeCita,
  mensajeDeCancelacion,
} from "./cancelacion.ts";

const TOKEN = "0123456789abcdef".repeat(4);

test("token válido: 64 hexadecimales en minúscula", () => {
  assert.equal(esTokenValido(TOKEN), true);
  assert.equal(esTokenValido(TOKEN.toUpperCase()), false, "los reales son minúsculas");
  assert.equal(esTokenValido(TOKEN.slice(1)), false, "63 caracteres");
  assert.equal(esTokenValido(TOKEN + "0"), false, "65 caracteres");
  assert.equal(esTokenValido(TOKEN.replace("a", "g")), false, "letra fuera de hex");
  assert.equal(esTokenValido(`${TOKEN.slice(0, 32)}/../${TOKEN.slice(36)}`), false);
  assert.equal(esTokenValido(undefined), false);
  assert.equal(esTokenValido(null), false);
  assert.equal(esTokenValido(123), false);
});

test("estado de la cita según la base y la hora", () => {
  const ahora = new Date("2026-11-02T15:00:00Z");
  assert.equal(estadoDeCita({ estado: "confirmada", inicio: "2026-11-02T16:00:00Z" }, ahora), "vigente");
  assert.equal(estadoDeCita({ estado: "confirmada", inicio: "2026-11-02T15:00:00Z" }, ahora), "pasada",
    "una cita que empieza justo ahora ya no se cancela (igual que la base)");
  assert.equal(estadoDeCita({ estado: "confirmada", inicio: "2026-11-01T16:00:00Z" }, ahora), "pasada");
  assert.equal(estadoDeCita({ estado: "cancelada", inicio: "2026-11-03T16:00:00Z" }, ahora), "cancelada");
  assert.equal(estadoDeCita({ estado: "cancelada", inicio: new Date("2026-10-01T16:00:00Z") }, ahora), "cancelada",
    "cancelada gana aunque ya haya pasado");
});

test("cada código de cancelar_por_token se reconoce y tiene mensaje", () => {
  for (const codigo of CODIGOS_CANCELACION) {
    assert.equal(codigoDeCancelacion({ message: codigo }), codigo);
    assert.ok(mensajeDeCancelacion(codigo).length > 0);
  }
});

test("errores ajenos o vacíos son desconocidos", () => {
  assert.equal(codigoDeCancelacion(null), "desconocido");
  assert.equal(codigoDeCancelacion({ message: "connection refused" }), "desconocido");
  assert.equal(codigoDeCancelacion({ message: "token_invalido y algo más" }), "desconocido");
  assert.match(mensajeDeCancelacion("desconocido"), /Intenta de nuevo/);
});
