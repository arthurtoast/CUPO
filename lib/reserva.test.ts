// T-10 · Pruebas de la validación de datos del cliente (lib/reserva.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODIGOS_ERROR,
  ERRORES_DE_HORARIO,
  NOMBRE_MAX,
  codigoDeError,
  mensajeDeError,
  normalizarDatos,
  validarDatos,
} from "./reserva.ts";

const BUENOS = { nombre: "Ana Ruiz", correo: "ana@correo.com", telefono: "81 1234 5678" };

test("normaliza como la base: recorta, minúsculas y solo dígitos", () => {
  assert.deepEqual(
    normalizarDatos({ nombre: "  Ana  ", correo: " Ana@Correo.COM ", telefono: "(81) 1234-5678" }),
    { nombre: "Ana", correo: "ana@correo.com", telefono: "8112345678" },
  );
});

test("datos correctos pasan y regresan normalizados", () => {
  const r = validarDatos(BUENOS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.datos.telefono, "8112345678");
});

test("faltantes: un error por campo", () => {
  const r = validarDatos({});
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errores).sort(), ["correo", "nombre", "telefono"]);
});

test("nombre: solo espacios no cuenta y el máximo se mide en caracteres", () => {
  assert.equal(validarDatos({ ...BUENOS, nombre: "   " }).ok, false);
  assert.equal(validarDatos({ ...BUENOS, nombre: "ñ".repeat(NOMBRE_MAX) }).ok, true);
  assert.equal(validarDatos({ ...BUENOS, nombre: "😀".repeat(NOMBRE_MAX) }).ok, true);
  assert.equal(validarDatos({ ...BUENOS, nombre: "a".repeat(NOMBRE_MAX + 1) }).ok, false);
});

test("correo: misma forma que la base", () => {
  for (const malo of ["ana", "ana@correo", "ana correo@x.com", "@correo.com", "ana@@x.com"]) {
    assert.equal(validarDatos({ ...BUENOS, correo: malo }).ok, false, malo);
  }
  assert.equal(validarDatos({ ...BUENOS, correo: "a.b+c@sub.dominio.mx" }).ok, true);
});

test("teléfono: de 10 a 15 dígitos, sin importar separadores", () => {
  assert.equal(validarDatos({ ...BUENOS, telefono: "812345678" }).ok, false);
  assert.equal(validarDatos({ ...BUENOS, telefono: "+52 81 1234 5678" }).ok, true);
  assert.equal(validarDatos({ ...BUENOS, telefono: "1".repeat(15) }).ok, true);
  assert.equal(validarDatos({ ...BUENOS, telefono: "1".repeat(16) }).ok, false);
  assert.equal(validarDatos({ ...BUENOS, telefono: "sin número" }).ok, false);
});

test("codigoDeError reconoce cada código de reservar_cita", () => {
  for (const codigo of CODIGOS_ERROR) {
    assert.equal(codigoDeError({ code: "P0001", message: codigo }), codigo);
  }
});

test("una violación de exclusión (23P01) es horario ocupado aunque cambie el texto", () => {
  assert.equal(
    codigoDeError({ code: "23P01", message: 'conflicting key value violates exclusion constraint "cita_sin_traslape"' }),
    "horario_ocupado",
  );
});

test("errores ajenos o vacíos son desconocidos", () => {
  assert.equal(codigoDeError(null), "desconocido");
  assert.equal(codigoDeError({ code: "08006", message: "connection failure" }), "desconocido");
  assert.equal(codigoDeError({ message: "horario_ocupado y algo más" }), "desconocido");
});

test("todo código tiene mensaje y los de horario están marcados", () => {
  for (const codigo of [...CODIGOS_ERROR, "desconocido" as const]) {
    assert.ok(mensajeDeError(codigo).length > 0);
  }
  assert.ok(ERRORES_DE_HORARIO.has("horario_ocupado"));
  assert.ok(!ERRORES_DE_HORARIO.has("datos_invalidos"));
  assert.match(mensajeDeError("horario_ocupado"), /se acaba de ocupar/);
});
