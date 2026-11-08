// HU-06 y HU-07 · Pruebas de la marca del negocio (lib/marca.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESCRIPCION_MAX,
  DIRECCION_MAX,
  LOGO_MAX_BYTES,
  acentoPocoLegible,
  contrasteConBlanco,
  enlaceMapa,
  enlaceTelefono,
  esColorValido,
  normalizarColor,
  rutaLogo,
  validarLogo,
  validarMarca,
} from "./marca.ts";

const NEGOCIO = "aaaaaaaa-0000-4000-8000-000000000001";

// ---------------------------------------------------------------- logo

test("logo: PNG, JPG y WEBP de hasta 2 MB se aceptan", () => {
  assert.deepEqual(validarLogo({ type: "image/png", size: 1000 }), { ok: true, tipo: "image/png", extension: "png" });
  assert.deepEqual(validarLogo({ type: "image/jpeg", size: 1000 }), { ok: true, tipo: "image/jpeg", extension: "jpg" });
  assert.deepEqual(validarLogo({ type: "image/webp", size: 1000 }), { ok: true, tipo: "image/webp", extension: "webp" });
  assert.equal(validarLogo({ type: "image/png", size: LOGO_MAX_BYTES }).ok, true, "justo 2 MB entra");
  assert.equal(validarLogo({ type: "IMAGE/PNG", size: 10 }).ok, true, "el tipo no distingue mayúsculas");
});

test("logo: otros formatos se rechazan con mensaje claro", () => {
  for (const type of ["image/gif", "image/svg+xml", "application/pdf", "image/heic", ""]) {
    const r = validarLogo({ type, size: 1000 });
    assert.equal(r.ok, false, type);
    if (!r.ok) assert.match(r.error, /PNG, JPG o WEBP/);
  }
});

test("logo: más de 2 MB se rechaza con mensaje claro", () => {
  const r = validarLogo({ type: "image/png", size: LOGO_MAX_BYTES + 1 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /2 MB/);
});

test("logo: sin archivo o vacío pide elegir uno", () => {
  for (const archivo of [null, undefined, { type: "image/png", size: 0 }]) {
    const r = validarLogo(archivo);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Elige una imagen/);
  }
});

test("logo: la ruta empieza con la carpeta del negocio", () => {
  const ruta = rutaLogo(NEGOCIO, "png", 1730000000000);
  assert.equal(ruta, `${NEGOCIO}/logo-1730000000000.png`);
  assert.equal(ruta.split("/")[0], NEGOCIO, "las políticas de Storage revisan la primera carpeta");
});

// ---------------------------------------------------------------- color

test("color: hexadecimal de 6 dígitos", () => {
  assert.equal(esColorValido("#2B5CE6"), true);
  assert.equal(esColorValido("#2b5ce6"), true);
  assert.equal(esColorValido("#2B5"), false, "la forma corta no la acepta la base");
  assert.equal(esColorValido("2B5CE6"), false);
  assert.equal(esColorValido("#GGGGGG"), false);
  assert.equal(esColorValido("red"), false);
  assert.equal(esColorValido(null), false);
});

test("color: se normaliza a #RRGGBB en mayúsculas", () => {
  assert.equal(normalizarColor("#2b5ce6"), "#2B5CE6");
  assert.equal(normalizarColor(" 2b5ce6 "), "#2B5CE6", "acepta sin # y con espacios");
  assert.equal(normalizarColor("#12345"), null);
  assert.equal(normalizarColor("url(javascript:alert(1))"), null, "nunca deja pasar CSS arbitrario");
  assert.equal(normalizarColor(undefined), null);
});

test("color: avisa cuando el texto blanco casi no se lee", () => {
  assert.ok(Math.abs(contrasteConBlanco("#000000") - 21) < 0.01, "negro contra blanco es 21:1");
  assert.ok(Math.abs(contrasteConBlanco("#FFFFFF") - 1) < 0.01, "blanco contra blanco es 1:1");
  assert.equal(acentoPocoLegible("#2B5CE6"), false, "el azul por defecto se lee bien");
  assert.equal(acentoPocoLegible("#FFE066"), true, "un amarillo claro no");
  assert.equal(acentoPocoLegible("no-es-color"), false, "un color inválido no dispara el aviso");
});

// ---------------------------------------------------------------- descripción y contacto

test("marca: datos completos se aceptan y se limpian", () => {
  const r = validarMarca({
    color: "#2b5ce6",
    descripcion: "  Corte y peinado   en el centro  ",
    telefono: " 81 1234 5678 ",
    direccion: "Av. Pablo Livas 1420,  Guadalupe",
  });
  assert.deepEqual(r, {
    ok: true,
    datos: {
      color: "#2B5CE6",
      descripcion: "Corte y peinado en el centro",
      telefono: "81 1234 5678",
      direccion: "Av. Pablo Livas 1420, Guadalupe",
    },
  });
});

test("marca: descripción, teléfono y dirección son opcionales", () => {
  const r = validarMarca({ color: "#000000", descripcion: "", telefono: "  ", direccion: undefined });
  assert.deepEqual(r, { ok: true, datos: { color: "#000000", descripcion: null, telefono: null, direccion: null } });
});

test("marca: la descripción conserva párrafos pero no líneas vacías de más", () => {
  const r = validarMarca({ color: "#000000", descripcion: "Uno\r\n\r\n\r\n\r\nDos" });
  assert.equal(r.ok && r.datos.descripcion, "Uno\n\nDos");
});

test("marca: límites iguales a los de la base", () => {
  const largo = validarMarca({ color: "#000000", descripcion: "a".repeat(DESCRIPCION_MAX + 1) });
  assert.equal(largo.ok, false);
  if (!largo.ok) assert.match(largo.errores.descripcion!, /280/);

  assert.equal(validarMarca({ color: "#000000", descripcion: "ñ".repeat(DESCRIPCION_MAX) }).ok, true,
    "cuenta caracteres, no bytes");

  const dir = validarMarca({ color: "#000000", direccion: "a".repeat(DIRECCION_MAX + 1) });
  assert.equal(dir.ok, false);
  if (!dir.ok) assert.ok(dir.errores.direccion);
});

test("marca: teléfonos válidos e inválidos", () => {
  for (const telefono of ["81 1234 5678", "+52 (81) 1234-5678", "8112345678", "123.4567"]) {
    assert.equal(validarMarca({ color: "#000000", telefono }).ok, true, telefono);
  }
  for (const telefono of ["llámame", "123", "81-1234-5678 ext 2", "1".repeat(16), "+52 81 1234 5678 9999 0000 00"]) {
    const r = validarMarca({ color: "#000000", telefono });
    assert.equal(r.ok, false, telefono);
    if (!r.ok) assert.ok(r.errores.telefono);
  }
});

test("marca: un color inválido marca solo ese campo", () => {
  const r = validarMarca({ color: "azul", telefono: "81 1234 5678" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errores), ["color"]);
});

// ---------------------------------------------------------------- enlaces

test("enlaces de teléfono y mapa", () => {
  assert.equal(enlaceTelefono("+52 (81) 1234-5678"), "tel:+528112345678");
  assert.equal(
    enlaceMapa("Av. Pablo Livas 1420, Guadalupe, N.L."),
    "https://www.google.com/maps/search/?api=1&query=Av.%20Pablo%20Livas%201420%2C%20Guadalupe%2C%20N.L.",
  );
});
