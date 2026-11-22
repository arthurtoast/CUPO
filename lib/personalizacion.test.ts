// HU-16 · Pruebas de la personalización de la página (lib/personalizacion.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BIENVENIDA_MAX,
  PORTADA_MAX_BYTES,
  enlacesRedes,
  normalizarFacebook,
  normalizarInstagram,
  normalizarWhatsapp,
  rutaPortada,
  validarPersonalizacion,
  validarPortada,
  whatsappParaEditar,
} from "./personalizacion.ts";

const NEGOCIO = "aaaaaaaa-0000-4000-8000-000000000001";

// ---------------------------------------------------------------- portada

test("portada: PNG, JPG y WEBP de hasta 2 MB se aceptan", () => {
  assert.deepEqual(validarPortada({ type: "image/png", size: 1000 }), { ok: true, tipo: "image/png", extension: "png" });
  assert.deepEqual(validarPortada({ type: "image/jpeg", size: 1000 }), { ok: true, tipo: "image/jpeg", extension: "jpg" });
  assert.deepEqual(validarPortada({ type: "image/webp", size: 1000 }), { ok: true, tipo: "image/webp", extension: "webp" });
  assert.equal(validarPortada({ type: "image/jpeg", size: PORTADA_MAX_BYTES }).ok, true, "justo 2 MB entra");
});

test("portada: otros formatos, más de 2 MB o sin archivo se rechazan", () => {
  for (const type of ["image/gif", "image/svg+xml", "application/pdf", "image/heic", ""]) {
    const r = validarPortada({ type, size: 1000 });
    assert.equal(r.ok, false, type);
    if (!r.ok) assert.match(r.error, /PNG, JPG o WEBP/);
  }
  const pesada = validarPortada({ type: "image/jpeg", size: PORTADA_MAX_BYTES + 1 });
  assert.equal(pesada.ok, false);
  if (!pesada.ok) assert.match(pesada.error, /2 MB/);
  for (const vacio of [null, undefined, { type: "image/png", size: 0 }]) {
    const r = validarPortada(vacio);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Elige una imagen/);
  }
});

test("portada: la ruta empieza con la carpeta del negocio", () => {
  assert.equal(rutaPortada(NEGOCIO, "jpg", 1732150000000), `${NEGOCIO}/portada-1732150000000.jpg`);
  assert.equal(rutaPortada(NEGOCIO, "png", 1).split("/")[0], NEGOCIO);
});

// ---------------------------------------------------------------- bienvenida

test("bienvenida: hasta 160 caracteres, sin espacios de más", () => {
  const r = validarPersonalizacion({ bienvenida: "  Bienvenida al   spa.\nTe esperamos  " });
  assert.equal(r.ok && r.datos.bienvenida, "Bienvenida al spa. Te esperamos");
  assert.equal(validarPersonalizacion({ bienvenida: "ñ".repeat(BIENVENIDA_MAX) }).ok, true, "cuenta caracteres, no bytes");
  const larga = validarPersonalizacion({ bienvenida: "a".repeat(BIENVENIDA_MAX + 1) });
  assert.equal(larga.ok, false);
  if (!larga.ok) assert.match(larga.errores.bienvenida!, /160/);
});

test("todo es opcional: vacío se guarda como null", () => {
  assert.deepEqual(validarPersonalizacion({ bienvenida: " ", instagram: "", facebook: undefined, whatsapp: null }), {
    ok: true,
    datos: { bienvenida: null, instagram: null, facebook: null, whatsapp: null },
  });
});

// ---------------------------------------------------------------- redes

test("instagram: usuario con o sin @, o enlace pegado", () => {
  for (const valor of ["spa.carla", "@spa.carla", " @spa.carla ", "https://www.instagram.com/spa.carla/?hl=es",
    "instagram.com/spa.carla", "http://instagram.com/spa.carla"]) {
    assert.equal(normalizarInstagram(valor), "spa.carla", valor);
  }
  for (const valor of ["spa carla", "spa-carla", "https://instagram.com/", "a".repeat(31), "javascript:alert(1)"]) {
    assert.equal(normalizarInstagram(valor), null, valor);
  }
});

test("facebook: página, enlace o perfil con id", () => {
  for (const valor of ["spa.carla.mty", "facebook.com/spa.carla.mty", "https://www.facebook.com/spa.carla.mty/",
    "https://m.facebook.com/spa.carla.mty?ref=bookmarks"]) {
    assert.equal(normalizarFacebook(valor), "spa.carla.mty", valor);
  }
  assert.equal(normalizarFacebook("https://www.facebook.com/profile.php?id=100012345678&sk=about"),
    "profile.php?id=100012345678");
  for (const valor of ["spa carla", "https://facebook.com/", "<script>", "a"]) {
    assert.equal(normalizarFacebook(valor), null, valor);
  }
});

test("whatsapp: 10 dígitos se toman de México; con lada se respeta", () => {
  assert.equal(normalizarWhatsapp("81 1234 5678"), "528112345678");
  assert.equal(normalizarWhatsapp("(81) 1234-5678"), "528112345678");
  assert.equal(normalizarWhatsapp("+52 81 1234 5678"), "528112345678");
  assert.equal(normalizarWhatsapp("+1 512 555 0100"), "15125550100");
  assert.equal(normalizarWhatsapp("0052 81 1234 5678"), "528112345678");
  assert.equal(normalizarWhatsapp("https://wa.me/528112345678"), "528112345678");
  assert.equal(normalizarWhatsapp("https://api.whatsapp.com/send?phone=528112345678"), "528112345678");
  for (const valor of ["1234567", "llámame", "+1 555", "1".repeat(16)]) {
    assert.equal(normalizarWhatsapp(valor), null, valor);
  }
});

test("redes inválidas marcan solo su campo", () => {
  const r = validarPersonalizacion({ instagram: "spa carla", facebook: "spa.carla", whatsapp: "123" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(Object.keys(r.errores).sort(), ["instagram", "whatsapp"]);
    assert.match(r.errores.whatsapp!, /10 dígitos/);
  }
});

test("enlaces: solo se muestran las redes que el negocio llenó", () => {
  assert.deepEqual(enlacesRedes({ instagram: null, facebook: null, whatsapp: null }), []);
  assert.deepEqual(enlacesRedes({ instagram: "spa.carla", facebook: null, whatsapp: "528112345678" }), [
    { red: "instagram", etiqueta: "Instagram", href: "https://www.instagram.com/spa.carla/" },
    { red: "whatsapp", etiqueta: "WhatsApp", href: "https://wa.me/528112345678" },
  ]);
  assert.equal(
    enlacesRedes({ instagram: null, facebook: "profile.php?id=100012345678", whatsapp: null })[0]!.href,
    "https://www.facebook.com/profile.php?id=100012345678",
  );
});

test("whatsapp guardado se muestra como se escribió y vuelve a guardarse igual", () => {
  assert.equal(whatsappParaEditar(null), "");
  assert.equal(whatsappParaEditar("528112345678"), "81 1234 5678");
  assert.equal(whatsappParaEditar("15125550100"), "+15125550100");
  for (const guardado of ["528112345678", "15125550100"]) {
    assert.equal(normalizarWhatsapp(whatsappParaEditar(guardado)), guardado, guardado);
  }
});
