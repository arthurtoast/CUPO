// T-16 · Pruebas E2E de los flujos críticos (registro, reserva y agenda).
// Corren contra la app compilada (npm run build) y Supabase local con la
// semilla de Estética Lupita. Correr con: npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Los tres flujos comparten la agenda de la semilla: en orden.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    locale: "es-MX",
    timezoneId: "America/Monterrey",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
