// T-13 · Prueba de integración del flujo de reserva (HU-09, HU-10, HU-11 y HU-13).
//
// A diferencia de las pruebas de lib/ (lógica pura) y de las pgTAP (SQL dentro
// de una transacción), esta corre contra Supabase levantado de verdad: habla con
// la API REST por supabase-js con la llave pública, como la página de reserva de
// un visitante sin cuenta. Junta las piezas: vistas públicas, cálculo de huecos
// (lib/huecos.ts), reservar_cita, la restricción sin traslape, los códigos de
// error que traduce lib/reserva.ts y la cancelación con el token.
//
// Requiere la base local con la semilla (Estética Lupita):
//   npx supabase start && npx supabase db reset
//   npm run test:integracion
//
// Toma la URL y la llave de API_URL y PUBLISHABLE_KEY (salida de
// `supabase status -o env`, así corre en el CI) o de .env.local.
// Las citas que crea quedan canceladas, así que se puede correr varias veces.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { calcularDias, instanteLocal, sumarDias, fechaLocal, diaSemanaIso, type Hueco } from "../../lib/huecos.ts";
import { codigoDeError, ERRORES_DE_HORARIO } from "../../lib/reserva.ts";

const URL_SUPABASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE =
  process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const SLUG = "estetica-lupita";
const DIAS = 14;

const sinSupabase = !URL_SUPABASE || !LLAVE
  ? "Falta la URL o la llave de Supabase (corre npx supabase start y llena .env.local)"
  : false;

test("flujo de reserva de un visitante contra Supabase local", { skip: sinSupabase }, async (t) => {
  const supabase = createClient(URL_SUPABASE!, LLAVE!, { auth: { persistSession: false } });
  const marca = `integracion-${Date.now()}`;
  const cliente = (n: number) => ({
    p_slug: SLUG,
    p_nombre: `Cliente de integración ${n}`,
    p_correo: `${marca}-${n}@correo.test`,
    p_telefono: `81${String(n).padStart(8, "0")}`,
  });

  // Lo mismo que lee app/[slug]/datos.ts para pintar la página.
  async function leerPagina() {
    const { data: negocio, error } = await supabase
      .from("vista_marca")
      .select("id, nombre, zona_horaria")
      .eq("slug", SLUG)
      .single();
    assert.ifError(error);
    const [servicio, horario, ocupados] = await Promise.all([
      supabase.from("vista_servicio").select("id, duracion_min").eq("negocio_id", negocio.id)
        .order("creado_en").order("id").limit(1).single(),
      supabase.from("vista_horario").select("dia_semana, hora_inicio, hora_fin").eq("negocio_id", negocio.id),
      supabase.from("vista_ocupado").select("inicio, fin").eq("negocio_id", negocio.id),
    ]);
    for (const r of [servicio, horario, ocupados]) assert.ifError(r.error);
    const dias = calcularDias({
      horario: horario.data!,
      ocupados: ocupados.data!,
      duracionMin: servicio.data!.duracion_min,
      zonaHoraria: negocio.zona_horaria,
      ahora: new Date(),
      dias: DIAS,
    });
    return { negocio, duracionMin: servicio.data!.duracion_min as number, dias };
  }

  const libres = (dias: { huecos: Hueco[] }[]) => dias.flatMap((d) => d.huecos.filter((h) => h.libre));

  let pagina: Awaited<ReturnType<typeof leerPagina>>;
  let hueco: Hueco;
  let token: string;

  await t.test("la página pública lee el negocio y ofrece horarios libres", async () => {
    pagina = await leerPagina();
    assert.equal(pagina.negocio.nombre, "Estética Lupita");
    const todos = libres(pagina.dias);
    assert.ok(todos.length > 0, "la semilla debe dejar horarios libres en los próximos días");
    // El último hueco libre: lejos de las citas de la semilla y del script de concurrencia.
    hueco = todos.at(-1)!;
  });

  await t.test("un visitante reserva un horario libre sin cuenta", async () => {
    const { data, error } = await supabase
      .rpc("reservar_cita", { ...cliente(1), p_inicio: hueco.inicio })
      .single<{ cita_id: string; token_cancelacion: string; inicio: string; fin: string }>();
    assert.ifError(error);
    assert.equal(new Date(data!.inicio).toISOString(), hueco.inicio);
    const minutos = (Date.parse(data!.fin) - Date.parse(data!.inicio)) / 60_000;
    assert.equal(minutos, pagina.duracionMin, "la cita dura lo que el servicio");
    assert.match(data!.token_cancelacion, /^[0-9a-f]{64}$/, "token de 32 bytes en hexadecimal");
    token = data!.token_cancelacion;
  });

  await t.test("el horario reservado deja de ofrecerse", async () => {
    const despues = await leerPagina();
    const sigue = libres(despues.dias).some((h) => h.inicio === hueco.inicio);
    assert.equal(sigue, false);
  });

  await t.test("nadie más puede quedarse con el mismo horario (HU-11)", async () => {
    const { error } = await supabase.rpc("reservar_cita", { ...cliente(2), p_inicio: hueco.inicio });
    assert.ok(error, "la segunda reserva debe fallar");
    assert.equal(error.code, "23P01", "lo rechaza la restricción de exclusión");
    assert.equal(codigoDeError(error), "horario_ocupado", "la página muestra el mensaje correcto");
  });

  await t.test("la vista de ocupados no expone datos del cliente", async () => {
    const { data, error } = await supabase.from("vista_ocupado").select("*").limit(1);
    assert.ifError(error);
    assert.deepEqual(Object.keys(data![0]!).sort(), ["bloqueo", "fin", "inicio", "negocio_id", "staff_id"]);
    const directo = await supabase.from("cita").select("id, correo_cliente").like("correo_cliente", `${marca}%`);
    assert.ok(directo.error || directo.data!.length === 0, "el visitante no lee la tabla cita");
  });

  await t.test("el cliente ve su cita con el enlace y la cancela (HU-13)", async () => {
    const cita = await supabase.rpc("cita_por_token", { p_token: token })
      .single<{ estado: string; negocio_slug: string; nombre_cliente: string }>();
    assert.ifError(cita.error);
    assert.equal(cita.data!.estado, "confirmada");
    assert.equal(cita.data!.negocio_slug, SLUG);

    const cancelada = await supabase.rpc("cancelar_por_token", { p_token: token })
      .single<{ estado: string; cancelada_en: string | null }>();
    assert.ifError(cancelada.error);
    assert.equal(cancelada.data!.estado, "cancelada");
    assert.ok(cancelada.data!.cancelada_en);

    const otraVez = await supabase.rpc("cancelar_por_token", { p_token: token });
    assert.equal(otraVez.error?.message, "cita_ya_cancelada", "no se cancela dos veces");
  });

  await t.test("al cancelar, el horario vuelve a estar libre", async () => {
    const despues = await leerPagina();
    assert.ok(libres(despues.dias).some((h) => h.inicio === hueco.inicio));
  });

  await t.test("un token inventado no cancela nada", async () => {
    for (const falso of ["0".repeat(64), "no-es-un-token"]) {
      const { error } = await supabase.rpc("cancelar_por_token", { p_token: falso });
      assert.equal(error?.message, "token_invalido", falso);
    }
  });

  await t.test("la base rechaza horarios que la página nunca ofrece", async () => {
    const zona = pagina.negocio.zona_horaria as string;
    // Un domingo de las próximas dos semanas: la semilla no abre en domingo.
    const hoy = fechaLocal(new Date(), zona);
    const domingo = Array.from({ length: DIAS }, (_, i) => sumarDias(hoy, i + 1))
      .find((f) => diaSemanaIso(f) === 7)!;
    const fueraDeHorario = instanteLocal(domingo, "10:00", zona).toISOString();
    // 10 minutos después del primer horario del día: cabe en el bloque pero no
    // cae en la rejilla del servicio.
    const diaDelHueco = pagina.dias.find((d) => d.huecos.some((h) => h.inicio === hueco.inicio))!;
    const noAlineado = new Date(Date.parse(diaDelHueco.huecos[0]!.inicio) + 10 * 60_000).toISOString();
    const pasado = new Date(Date.now() - 86_400_000).toISOString();

    for (const [inicio, esperado] of [
      [fueraDeHorario, "fuera_de_horario"],
      [noAlineado, "horario_no_alineado"],
      [pasado, "horario_pasado"],
    ] as const) {
      const { error } = await supabase.rpc("reservar_cita", { ...cliente(3), p_inicio: inicio });
      assert.ok(error, esperado);
      assert.equal(codigoDeError(error), esperado);
      assert.ok(ERRORES_DE_HORARIO.has(codigoDeError(error)), `${esperado} hace que la página quite la selección`);
    }

    const datosMalos = await supabase.rpc("reservar_cita", {
      ...cliente(4), p_correo: "no-es-correo", p_inicio: hueco.inicio,
    });
    assert.equal(codigoDeError(datosMalos.error), "datos_invalidos");

    const otroNegocio = await supabase.rpc("reservar_cita", {
      ...cliente(5), p_slug: "no-existe-este-negocio", p_inicio: hueco.inicio,
    });
    assert.equal(codigoDeError(otroNegocio.error), "negocio_no_existe");
  });
});
