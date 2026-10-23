// HU-12 · Pruebas del contenido de los correos (lib/correos.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoParaNegocio,
  correoParaCliente,
  escaparHtml,
  fechaDeCita,
  telefonoLegible,
  type DatosCita,
} from "./correos.ts";

const TOKEN = "a".repeat(64);

function datos(extra: Partial<DatosCita> = {}): DatosCita {
  return {
    negocio: {
      nombre: "Estética Lupita",
      telefono: "81 1234 5678",
      direccion: "Av. Pablo Livas 1420, Guadalupe, N.L.",
      zonaHoraria: "America/Monterrey",
    },
    servicio: { nombre: "Corte y peinado", duracionMin: 45 },
    cliente: { nombre: "Ana Ruiz", correo: "ana@correo.test", telefono: "8112345678" },
    inicio: "2026-10-29T16:30:00Z", // jueves 10:30 en Monterrey
    enlaceCancelar: `https://cupo.app/cancelar/${TOKEN}`,
    enlaceAgenda: "https://cupo.app/panel",
    ...extra,
  };
}

test("la fecha se escribe en la hora del negocio y con mayúscula inicial", () => {
  assert.equal(fechaDeCita("2026-10-29T16:30:00Z", "America/Monterrey"), "Jueves, 29 de octubre, 10:30");
  assert.equal(fechaDeCita("2026-10-29T16:30:00Z", "UTC"), "Jueves, 29 de octubre, 16:30");
});

test("teléfono de 10 dígitos con espacios; los demás tal cual", () => {
  assert.equal(telefonoLegible("8112345678"), "81 1234 5678");
  assert.equal(telefonoLegible("528112345678"), "528112345678");
});

test("escaparHtml neutraliza las cinco entidades", () => {
  assert.equal(escaparHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("correo al cliente: fecha, hora, negocio y enlace para cancelar", () => {
  const c = correoParaCliente(datos(), "hola@esteticalupita.test");
  assert.equal(c.para, "ana@correo.test");
  assert.equal(c.responderA, "hola@esteticalupita.test");
  assert.equal(c.asunto, "Tu cita en Estética Lupita: Jueves, 29 de octubre, 10:30");
  for (const parte of [c.texto, c.html]) {
    assert.ok(parte.includes("Jueves, 29 de octubre, 10:30"));
    assert.ok(parte.includes("Estética Lupita"));
    assert.ok(parte.includes("Corte y peinado · 45 min"));
    assert.ok(parte.includes(`https://cupo.app/cancelar/${TOKEN}`));
    assert.ok(parte.includes("Av. Pablo Livas 1420"));
  }
  assert.match(c.html, /href="tel:8112345678"/);
});

test("correo al cliente sin dirección ni teléfono del negocio no deja filas vacías", () => {
  const c = correoParaCliente(datos({
    negocio: { nombre: "Barbería", telefono: null, direccion: null, zonaHoraria: "America/Monterrey" },
  }));
  assert.equal(c.responderA, null);
  assert.ok(!c.texto.includes("Dirección"));
  assert.ok(!c.texto.includes("Teléfono"));
});

test("aviso al negocio: datos del cliente y responder le escribe al cliente", () => {
  const c = avisoParaNegocio(datos(), "lupita@cupo.test");
  assert.equal(c.para, "lupita@cupo.test");
  assert.equal(c.responderA, "ana@correo.test");
  assert.equal(c.asunto, "Cita nueva: Ana Ruiz, Jueves, 29 de octubre, 10:30");
  for (const parte of [c.texto, c.html]) {
    assert.ok(parte.includes("Ana Ruiz"));
    assert.ok(parte.includes("ana@correo.test"));
    assert.ok(parte.includes("81 1234 5678"));
    assert.ok(parte.includes("https://cupo.app/panel"));
  }
  assert.ok(!c.texto.includes(TOKEN), "el negocio no recibe el enlace de cancelación del cliente");
  assert.ok(!c.html.includes(TOKEN));
});

test("lo que escribe el cliente no puede inyectar HTML ni cabeceras", () => {
  const malo = datos({
    cliente: { nombre: 'Eva <script>alert(1)</script>\r\nBcc: x@y.z', correo: "eva@correo.test", telefono: "8100000000" },
  });
  const aviso = avisoParaNegocio(malo, "lupita@cupo.test");
  assert.ok(!aviso.html.includes("<script>"));
  assert.ok(aviso.html.includes("&lt;script&gt;"));
  assert.ok(!/[\r\n]/.test(aviso.asunto), "el asunto queda en una línea");
  const cliente = correoParaCliente(malo);
  assert.ok(!cliente.html.includes("<script>"));
});
