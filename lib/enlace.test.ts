// HU-08 · Pruebas del enlace público (lib/enlace.ts).
// Correr con: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { enlacePublico, enlaceVisible, origenDesdeHeaders } from "./enlace.ts";

test("arma el enlace con el origen y el slug", () => {
  assert.equal(enlacePublico("https://cupo.app", "estetica-lupita"), "https://cupo.app/estetica-lupita");
  assert.equal(enlacePublico("https://cupo.app/", "estetica-lupita"), "https://cupo.app/estetica-lupita");
});

test("muestra el enlace sin protocolo", () => {
  assert.equal(enlaceVisible("https://cupo.app/estetica-lupita"), "cupo.app/estetica-lupita");
  assert.equal(enlaceVisible("http://localhost:3000/estetica-lupita"), "localhost:3000/estetica-lupita");
});

test("en local usa host y http", () => {
  const headers = new Headers({ host: "localhost:3000" });
  assert.equal(origenDesdeHeaders(headers), "http://localhost:3000");
});

test("detrás de un proxy usa x-forwarded-host y x-forwarded-proto", () => {
  const headers = new Headers({
    host: "interno:8080",
    "x-forwarded-host": "cupo.app",
    "x-forwarded-proto": "https",
  });
  assert.equal(origenDesdeHeaders(headers), "https://cupo.app");
});

test("con proxies encadenados toma el primer valor", () => {
  const headers = new Headers({
    "x-forwarded-host": "cupo.app, interno",
    "x-forwarded-proto": "https,http",
  });
  assert.equal(origenDesdeHeaders(headers), "https://cupo.app");
});

test("un host público sin x-forwarded-proto se asume https", () => {
  const headers = new Headers({ host: "cupo.app" });
  assert.equal(origenDesdeHeaders(headers), "https://cupo.app");
});
