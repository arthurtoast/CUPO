// HU-17 · Pruebas del chat que agenda (lib/chat.ts). Correr con: npm test
import { test } from "node:test";                                                 // aporta: corredor de pruebas de Node
import assert from "node:assert/strict";                                          // aporta: comparaciones estrictas
import { alReservar, entenderDia, entenderHora, iniciar, normalizar, responder, type ContextoChat, type Turno } from "./chat.ts"; // aporta: lo que se prueba
import { calcularDias } from "./huecos.ts";                                       // aporta: los mismos días que ve la página

// Lunes 30 de noviembre de 2026, 08:00 en Monterrey (14:00 UTC).
const AHORA = new Date("2026-11-30T14:00:00Z");                                   // aporta: fecha fija para que la prueba no caduque
const HORARIO = [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_inicio: "09:00", hora_fin: "12:00" })); // aporta: lunes a viernes 9 a 12
const dias = (ocupados: { inicio: string; fin: string }[] = []) => calcularDias({ // aporta: días como los calcula la página
  horario: HORARIO, ocupados, duracionMin: 60, zonaHoraria: "America/Monterrey", ahora: AHORA, dias: 7,
});

const ANA = { id: "cccccccc-0000-4000-8000-0000000000a1", nombre: "Ana" };          // aporta: staff de prueba
const BETO = { id: "cccccccc-0000-4000-8000-0000000000a2", nombre: "Beto" };        // aporta: ídem

const SIN_STAFF: ContextoChat = {                                                  // aporta: negocio como antes de HU-18
  negocio: "Estética Lupita", telefono: "81 1234 5678", direccion: "Av. Pablo Livas 1420",
  servicio: { nombre: "Corte", duracion_min: 60 }, opciones: [{ staff: null, dias: dias() }],
};

// Martes 1 de diciembre, 10:00 local = 16:00 UTC: ocupado con Ana.
const OCUPADO_ANA = [{ inicio: "2026-12-01T16:00:00Z", fin: "2026-12-01T17:00:00Z" }]; // aporta: una cita de Ana
const CON_STAFF: ContextoChat = {                                                  // aporta: negocio con dos personas
  ...SIN_STAFF,
  opciones: [{ staff: ANA, dias: dias(OCUPADO_ANA) }, { staff: BETO, dias: dias() }],
};

// Corre una conversación y regresa el último turno.
function conversar(ctx: ContextoChat, entradas: string[]): Turno {
  let turno = iniciar(ctx);                                                        // aporta: saludo
  for (const e of entradas) turno = responder(ctx, turno.estado, e);               // aporta: cada respuesta del cliente
  return turno;
}

test("normaliza acentos, mayúsculas y signos", () => {
  assert.equal(normalizar("  ¿MAÑANA, a las 10?  "), "manana a las 10");          // aporta: forma comparable
});

test("sin staff empieza preguntando el día y solo ofrece días con lugar", () => {
  const t = iniciar(SIN_STAFF);                                                    // aporta: saludo
  assert.equal(t.estado.paso, "dia");                                              // aporta: no pregunta con quién
  assert.match(t.mensajes[0]!, /Corte \(60 min\) en Estética Lupita/);             // aporta: dice qué se agenda
  assert.deepEqual(t.botones.map((b) => b.valor), ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]); // aporta: fin de semana cerrado, no se ofrece
});

test("las horas del chat son exactamente las libres de la página", () => {
  const t = conversar(CON_STAFF, [ANA.id, "2026-12-01"]);                          // aporta: Ana, martes
  const libresPagina = CON_STAFF.opciones[0]!.dias[1]!.huecos.filter((h) => h.libre).map((h) => h.inicio); // aporta: lo que ofrece la página
  assert.deepEqual(t.botones.filter((b) => b.valor !== "otro dia").map((b) => b.valor), libresPagina); // aporta: criterio 1 del Issue
  assert.ok(!t.botones.some((b) => b.texto === "10:00"));                          // aporta: la hora ocupada no aparece
});

test("con staff pregunta con quién y cada persona tiene sus horas", () => {
  assert.equal(iniciar(CON_STAFF).estado.paso, "staff");                           // aporta: hay que elegir persona
  const beto = conversar(CON_STAFF, ["beto", "martes"]);                           // aporta: nombre escrito y día escrito
  assert.ok(beto.botones.some((b) => b.texto === "10:00"));                        // aporta: Beto sí tiene las 10:00
});

test("conversación completa: pide nombre, correo y teléfono antes de confirmar", () => {
  const pasos = ["mañana", "10", "  Ana Ruiz ", "ANA@Correo.com", "(81) 1234-5678"]; // aporta: lo que escribiría un cliente
  const t = conversar(SIN_STAFF, pasos);                                           // aporta: corre la conversación
  assert.equal(t.estado.paso, "confirmar");                                        // aporta: criterio 3: datos antes de confirmar
  assert.match(t.mensajes[0]!, /martes, 1 de diciembre a las 10:00, a nombre de Ana Ruiz \(ana@correo.com, 8112345678\)/); // aporta: datos limpios como los guarda la base
  const fin = responder(SIN_STAFF, t.estado, "sí");                                // aporta: confirma
  assert.deepEqual(fin.enviar, { inicio: "2026-12-01T16:00:00.000Z", staffId: null, nombre: "Ana Ruiz", correo: "ana@correo.com", telefono: "8112345678" }); // aporta: criterio 2: lo que va a reservar_cita
});

test("datos inválidos: dice qué corregir y no avanza", () => {
  const t = conversar(SIN_STAFF, ["mañana", "10", "Ana", "no-es-correo"]);          // aporta: correo mal escrito
  assert.equal(t.estado.paso, "correo");                                           // aporta: se queda pidiendo el correo
  assert.match(t.mensajes[0]!, /nombre@correo.com/);                               // aporta: mismo mensaje que el formulario
  assert.equal(conversar(SIN_STAFF, ["mañana", "10", "Ana", "a@b.co", "123"]).estado.paso, "telefono"); // aporta: teléfono corto
});

test("entiende horas en varias formas", () => {
  const huecos = dias()[1]!.huecos;                                                // aporta: martes 9, 10 y 11
  assert.deepEqual(entenderHora("10:00", huecos)?.map((h) => h.hora), ["10:00"]);  // aporta: con minutos
  assert.deepEqual(entenderHora("a las 11 am", huecos)?.map((h) => h.hora), ["11:00"]); // aporta: con am
  assert.deepEqual(entenderHora("4 de la tarde", huecos), []);                     // aporta: válida pero cerrado: lista vacía
  assert.equal(entenderHora("no sé", huecos), null);                               // aporta: no es una hora
  assert.equal(entenderHora("25:00", huecos), null);                               // aporta: hora imposible
});

test("entiende días en varias formas", () => {
  const d = dias();                                                                // aporta: lunes 30 nov a domingo 6 dic
  assert.equal((entenderDia("hoy", d) as { fecha: string }).fecha, "2026-11-30");  // aporta: hoy
  assert.equal((entenderDia("pasado mañana", d) as { fecha: string }).fecha, "2026-12-02"); // aporta: dos días después
  assert.equal((entenderDia("el viernes", d) as { fecha: string }).fecha, "2026-12-04"); // aporta: nombre del día
  assert.equal((entenderDia("3 de diciembre", d) as { fecha: string }).fecha, "2026-12-03"); // aporta: fecha con mes
  assert.equal((entenderDia("3/12", d) as { fecha: string }).fecha, "2026-12-03"); // aporta: fecha con diagonal
  assert.equal(entenderDia("25 de diciembre", d), "fuera");                        // aporta: fecha válida fuera del rango
  assert.equal(entenderDia("cuando sea", d), null);                                // aporta: no habló de un día
});

test("un día cerrado o lleno se dice y se vuelven a ofrecer los que sí tienen", () => {
  const t = conversar(SIN_STAFF, ["sábado"]);                                      // aporta: sábado cerrado
  assert.equal(t.estado.paso, "dia");                                              // aporta: sigue en el día
  assert.match(t.mensajes[0]!, /sábado, 5 de diciembre ya no hay horarios libres/); // aporta: lo explica
});

test("si no entiende o no sabe, da el teléfono del negocio", () => {
  const t = conversar(SIN_STAFF, ["blablá"]);                                      // aporta: texto sin sentido
  assert.match(t.mensajes[0]!, /llamar a Estética Lupita al 81 1234 5678/);        // aporta: criterio 4 del Issue
  const precio = conversar(SIN_STAFF, ["¿cuánto cuesta?"]);                        // aporta: algo que no sabe
  assert.match(precio.mensajes[0]!, /No tengo los precios. Puedes llamar/);        // aporta: criterio 4
  assert.equal(precio.estado.paso, "dia");                                         // aporta: no pierde el lugar en la conversación
  const sinTel = conversar({ ...SIN_STAFF, telefono: null }, ["blablá"]);          // aporta: negocio sin teléfono
  assert.match(sinTel.mensajes[0]!, /solo puedo ayudarte a agendar/);              // aporta: no inventa un teléfono
});

test("en los pasos de datos, un nombre no se confunde con una pregunta", () => {
  const t = conversar(SIN_STAFF, ["mañana", "10", "Dulce Persona"]);               // aporta: "persona" no dispara la ayuda
  assert.equal(t.estado.paso, "correo");                                           // aporta: tomó el nombre
});

test("cambiar el horario conserva los datos y vuelve a confirmar", () => {
  const t = conversar(SIN_STAFF, ["mañana", "10", "Ana", "a@b.co", "8111111111", "no", "cambiar horario", "miércoles", "9"]); // aporta: cambia de día y hora
  assert.equal(t.estado.paso, "confirmar");                                        // aporta: no vuelve a pedir datos
  assert.match(t.mensajes[0]!, /miércoles, 2 de diciembre a las 09:00, a nombre de Ana/); // aporta: datos conservados
});

test("si el horario se ocupó mientras confirmaba, no se envía", () => {
  const t = conversar(SIN_STAFF, ["mañana", "10", "Ana", "a@b.co", "8111111111"]); // aporta: listo para confirmar
  const ocupado: ContextoChat = { ...SIN_STAFF, opciones: [{ staff: null, dias: dias([{ inicio: "2026-12-01T16:00:00Z", fin: "2026-12-01T17:00:00Z" }]) }] }; // aporta: otro cliente lo tomó
  const fin = responder(ocupado, t.estado, "sí");                                  // aporta: confirma con datos nuevos
  assert.equal(fin.enviar, undefined);                                             // aporta: no manda nada
  assert.equal(fin.estado.paso, "hora");                                           // aporta: pide otra hora
});

test("respuesta de la base: reservada, horario ocupado y error de datos", () => {
  const t = responder(SIN_STAFF, conversar(SIN_STAFF, ["mañana", "10", "Ana", "a@b.co", "8111111111"]).estado, "si"); // aporta: enviando
  const ok = alReservar(SIN_STAFF, t.estado, { tipo: "reservada", inicio: "2026-12-01T16:00:00Z", enlaceCancelar: "https://x/cancelar/abc", correoEnviadoA: "a@b.co" }); // aporta: éxito
  assert.equal(ok.estado.paso, "listo");                                           // aporta: terminó
  assert.equal(ok.enlaceCancelar, "https://x/cancelar/abc");                       // aporta: el enlace para cancelar
  assert.match(ok.mensajes.join(" "), /confirmación a a@b.co/);                    // aporta: mismo correo que el formulario
  const ocupado = alReservar(SIN_STAFF, t.estado, { tipo: "error", mensaje: "x", codigo: "horario_ocupado" }); // aporta: alguien ganó la carrera
  assert.equal(ocupado.estado.paso, "dia");                                        // aporta: vuelve a elegir
  assert.equal(ocupado.estado.nombre, "Ana");                                      // aporta: sin perder los datos
  const datos = alReservar(SIN_STAFF, t.estado, { tipo: "error", mensaje: "x", errores: { correo: "Revisa tu correo" } }); // aporta: la base rechazó el correo
  assert.equal(datos.estado.paso, "correo");                                       // aporta: lo vuelve a pedir
});

test("sin horarios libres lo dice y da el teléfono", () => {
  const t = iniciar({ ...SIN_STAFF, opciones: [{ staff: null, dias: [] }] });      // aporta: nada libre
  assert.equal(t.estado.paso, "sin_horarios");                                     // aporta: no hay flujo
  assert.match(t.mensajes.join(" "), /81 1234 5678/);                              // aporta: la salida
});

test("un sí con negación o duda no confirma", () => {
  const listo = conversar(SIN_STAFF, ["mañana", "10", "Ana", "a@b.co", "8111111111"]); // aporta: en el resumen
  for (const dudoso of ["claro que no", "si pero cambia la hora", "ok, mejor no"]) {
    const t = responder(SIN_STAFF, listo.estado, dudoso);                         // aporta: respuestas ambiguas
    assert.equal(t.enviar, undefined, dudoso);                                     // aporta: nunca envía
    assert.equal(t.estado.paso, "cambiar", dudoso);                                // aporta: pregunta qué cambiar
  }
});

test("corregir un solo dato regresa directo al resumen", () => {
  const t = conversar(SIN_STAFF, ["mañana", "10", "Ana", "a@b.co", "8111111111", "no", "cambiar correo", "ana@nuevo.mx"]); // aporta: solo el correo
  assert.equal(t.estado.paso, "confirmar");                                        // aporta: no vuelve a pedir nombre ni teléfono
  assert.match(t.mensajes[0]!, /a nombre de Ana \(ana@nuevo.mx, 8111111111\)/);   // aporta: los demás datos intactos
});

test("fechas y horas que no existen no se aceptan", () => {
  const d = dias();                                                                // aporta: días calculados
  assert.equal(entenderDia("31/02", d), null);                                     // aporta: no existe
  assert.equal(entenderDia("31/04", d), null);                                     // aporta: abril tiene 30
  const huecos = d[1]!.huecos;                                                     // aporta: martes
  assert.equal(entenderHora("13 pm", huecos), null);                               // aporta: no existe
  assert.equal(entenderHora("0 de la tarde", huecos), null);                       // aporta: no existe
  assert.deepEqual(entenderHora("12 am", huecos), []);                             // aporta: medianoche: válida pero cerrado
});
