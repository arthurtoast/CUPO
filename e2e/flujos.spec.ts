// T-16 · Flujos críticos de Cupo desde el navegador.
//
// 1. Un negocio nuevo se registra y llega a su agenda con su enlace público.
// 2. Un visitante sin cuenta abre el enlace de la semilla y aparta una cita.
// 3. El dueño de la semilla entra y ve esa cita en su agenda.

import { expect, test } from "@playwright/test";

const SLUG = "estetica-lupita";
const DUENO = { correo: "lupita@cupo.test", contrasena: "cupo-local-123" };

test("un negocio nuevo se registra y ve su agenda vacía con su enlace", async ({ page }, info) => {
  const id = `${Date.now()}-${info.project.name}`;
  await page.goto("/registro");
  await page.getByLabel("Nombre del negocio").fill(`Barbería E2E ${id}`);
  await page.getByLabel("Correo").fill(`e2e-${id}@cupo.test`);
  await page.getByLabel("Contraseña").fill("prueba-e2e-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu enlace público" })).toBeVisible();
  await expect(page.getByText(/barberia-e2e/)).toBeVisible();
});

test("un visitante sin cuenta reserva y la cita aparece en la agenda del negocio", async ({ page }, info) => {
  const cliente = `Cliente E2E ${Date.now()} ${info.project.name}`;

  // Reserva desde la página pública, sin iniciar sesión.
  await page.goto(`/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Estética Lupita" })).toBeVisible();
  await page.getByRole("radiogroup", { name: "Día" }).getByRole("radio").and(page.locator(":enabled")).first().click();
  await page.getByRole("radiogroup", { name: "Hora" }).getByRole("radio").and(page.locator(":enabled")).first().click();
  await page.getByLabel("Nombre", { exact: true }).fill(cliente);
  await page.getByLabel("Correo").fill("cliente-e2e@cupo.test");
  await page.getByLabel("Teléfono").fill("8112345678");
  await page.getByRole("button", { name: "Confirmar cita" }).click();
  await expect(page.getByRole("heading", { name: "Tu cita quedó apartada" })).toBeVisible();

  // El dueño entra y la ve en su agenda.
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.getByLabel("Correo").fill(DUENO.correo);
  await page.getByLabel("Contraseña").fill(DUENO.contrasena);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByText(cliente)).toBeVisible();

});
