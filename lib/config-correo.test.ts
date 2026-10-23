// HU-12 · Pruebas de la configuración SMTP (lib/config-correo.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUERTO_POR_DEFECTO,
  REMITENTE_POR_DEFECTO,
  TIMEOUT_POR_DEFECTO,
  baseDeEnlaces,
  leerConfigSmtp,
} from "./config-correo.ts";

test("sin SMTP_HOST no se envía nada", () => {
  assert.deepEqual(leerConfigSmtp({}), { ok: false, motivo: "sin_configurar" });
  assert.deepEqual(leerConfigSmtp({ SMTP_HOST: "   " }), { ok: false, motivo: "sin_configurar" });
});

test("solo con SMTP_HOST usa los valores por defecto", () => {
  const r = leerConfigSmtp({ SMTP_HOST: "127.0.0.1" });
  assert.deepEqual(r, {
    ok: true,
    config: {
      host: "127.0.0.1",
      port: PUERTO_POR_DEFECTO,
      secure: false,
      usuario: null,
      contrasena: null,
      remitente: REMITENTE_POR_DEFECTO,
      timeoutMs: TIMEOUT_POR_DEFECTO,
    },
  });
});

test("configuración completa", () => {
  const r = leerConfigSmtp({
    SMTP_HOST: "smtp.ejemplo.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "TRUE",
    SMTP_USER: "cupo",
    SMTP_PASS: "secreto",
    CORREO_REMITENTE: "Cupo <no-responder@ejemplo.com>",
    SMTP_TIMEOUT_MS: "5000",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.config.port, 465);
    assert.equal(r.config.secure, true);
    assert.equal(r.config.usuario, "cupo");
    assert.equal(r.config.timeoutMs, 5000);
  }
});

test("valores inválidos se reportan en vez de adivinar", () => {
  const casos: Record<string, string>[] = [
    { SMTP_PORT: "70000" },
    { SMTP_PORT: "abc" },
    { SMTP_SECURE: "si" },
    { SMTP_USER: "cupo" },
    { SMTP_PASS: "secreto" },
    { CORREO_REMITENTE: "Cupo" },
    { SMTP_TIMEOUT_MS: "10" },
  ];
  for (const extra of casos) {
    const r = leerConfigSmtp({ SMTP_HOST: "smtp.ejemplo.com", ...extra });
    assert.equal(r.ok, false, JSON.stringify(extra));
    if (!r.ok) assert.equal(r.motivo, "invalida");
  }
});

test("base de enlaces: CUPO_URL_PUBLICA manda; si no, el origen de la petición", () => {
  assert.equal(baseDeEnlaces({}, "http://localhost:3000"), "http://localhost:3000");
  assert.equal(baseDeEnlaces({ CUPO_URL_PUBLICA: "https://cupo.app/" }, "http://localhost:3000"), "https://cupo.app");
  assert.equal(baseDeEnlaces({ CUPO_URL_PUBLICA: "cupo.app" }, "http://localhost:3000"), "http://localhost:3000");
});
