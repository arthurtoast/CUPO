// Chat que agenda (HU-17): la conversación como una máquina de estados.
//
// No usa inteligencia artificial ni servicios externos: entiende un conjunto
// fijo de respuestas (botones, días, horas, sí/no y algunas preguntas comunes)
// y, cuando no entiende, da el teléfono del negocio. Así nunca inventa un
// horario: solo ofrece los huecos que calculó lib/huecos.ts, los mismos que ve
// la página, y la cita se crea con la misma acción que el formulario
// (reservar -> reservar_cita), que manda el mismo correo de confirmación.
//
// Sin dependencias (solo Intl), para probarlo con `node --test`.

import type { Dia, Hueco } from "./huecos.ts";                                      // aporta: días y huecos ya calculados
import { mensajeDeError, validarCampo, ERRORES_DE_HORARIO, type CampoCliente, type CodigoError } from "./reserva.ts"; // aporta: mismas reglas y textos que el formulario
import type { MiembroStaff } from "./staff.ts";                                     // aporta: con quién (HU-18)

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type OpcionStaff = { staff: MiembroStaff | null; dias: Dia[] };           // aporta: los días de cada persona (o del negocio sin staff)

export type ContextoChat = {
  negocio: string;                                                                // aporta: nombre para saludar
  telefono: string | null;                                                        // aporta: a dónde mandar lo que no sabe
  direccion: string | null;                                                       // aporta: respuesta a "¿dónde están?"
  servicio: { nombre: string; duracion_min: number };                             // aporta: qué se agenda y cuánto dura
  opciones: OpcionStaff[];                                                        // aporta: una por persona, o una sola sin staff
  maxDias?: number;                                                               // aporta: cuántos días ofrecer como botones (por defecto 7)
};

export type Paso =
  | "staff"                                                                       // aporta: elegir con quién
  | "dia"                                                                         // aporta: elegir día
  | "hora"                                                                        // aporta: elegir hora
  | "nombre"                                                                      // aporta: pedir nombre
  | "correo"                                                                      // aporta: pedir correo
  | "telefono"                                                                    // aporta: pedir teléfono
  | "confirmar"                                                                   // aporta: resumen y sí/no
  | "cambiar"                                                                     // aporta: qué quiere cambiar
  | "enviando"                                                                    // aporta: esperando a la base
  | "listo"                                                                       // aporta: cita creada
  | "sin_horarios";                                                               // aporta: no hay nada libre

export type EstadoChat = {
  paso: Paso;                                                                     // aporta: en qué parte va
  staffId: string | null;                                                         // aporta: persona elegida (null sin staff)
  fecha: string | null;                                                           // aporta: día elegido "YYYY-MM-DD"
  inicio: string | null;                                                          // aporta: hueco elegido (ISO en UTC)
  nombre: string;                                                                 // aporta: datos del cliente ya validados
  correo: string;                                                                 // aporta: ídem
  telefono: string;                                                               // aporta: ídem
  editando: boolean;                                                              // aporta: true si vino de "cambiar": al terminar salta a confirmar
  soloUno: boolean;                                                               // aporta: true si se corrige un solo dato: al validarlo, a confirmar
};

export type Boton = { texto: string; valor: string };                             // aporta: respuesta rápida; valor es lo que se "escribe"

export type Envio = {                                                             // aporta: lo que el componente manda a la acción reservar
  inicio: string;                                                                 // aporta: hueco
  staffId: string | null;                                                         // aporta: con quién
  nombre: string;                                                                 // aporta: datos del cliente
  correo: string;                                                                 // aporta: ídem
  telefono: string;                                                               // aporta: ídem
};

export type Turno = {
  estado: EstadoChat;                                                             // aporta: estado nuevo
  mensajes: string[];                                                             // aporta: lo que dice el asistente, en orden
  botones: Boton[];                                                               // aporta: respuestas rápidas para este paso
  enviar?: Envio;                                                                 // aporta: si viene, hay que crear la cita
  enlaceCancelar?: string;                                                        // aporta: al terminar, el enlace para cancelar
};

export type ResultadoReserva =                                                    // aporta: lo que regresa la acción reservar
  | { tipo: "reservada"; inicio: string; enlaceCancelar: string; correoEnviadoA: string | null }
  | { tipo: "error"; mensaje: string; codigo?: CodigoError; errores?: Partial<Record<CampoCliente, string>> };

const MAX_DIAS = 7;                                                               // aporta: botones de día por defecto (una semana)

const VACIO: EstadoChat = {                                                       // aporta: estado de partida
  paso: "dia", staffId: null, fecha: null, inicio: null,
  nombre: "", correo: "", telefono: "", editando: false, soloUno: false,
};

// ---------------------------------------------------------------------------
// Texto: normalizar y formatear
// ---------------------------------------------------------------------------

// Minúsculas, sin acentos ni signos, espacios simples: "¿Mañana?" -> "manana".
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")                           // aporta: quita acentos (á -> a, ñ -> n)
    .toLowerCase()                                                                // aporta: no importan mayúsculas
    .replace(/[¿?¡!,;"]/g, " ")                                                   // aporta: quita signos que no cambian el sentido
    .replace(/\s+/g, " ")                                                         // aporta: un solo espacio
    .trim();                                                                      // aporta: sin espacios en los extremos
}

// Fechas "YYYY-MM-DD" al mediodía UTC: el día nunca se recorre por la zona del visitante.
function formato(fecha: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-MX", { ...opciones, timeZone: "UTC" })      // aporta: español de México, en UTC
    .format(new Date(`${fecha}T12:00:00Z`))                                       // aporta: mediodía, lejos del cambio de día
    .replace(/\./g, "");                                                          // aporta: "jue." -> "jue"
}

export const diaLargo = (fecha: string) => formato(fecha, { weekday: "long", day: "numeric", month: "long" });  // aporta: "jueves, 3 de diciembre"
export const diaCorto = (fecha: string) => formato(fecha, { weekday: "short", day: "numeric", month: "short" }); // aporta: "jue, 3 dic"

const libres = (d: Dia) => d.huecos.filter((h) => h.libre);                      // aporta: huecos que se pueden ofrecer

// ---------------------------------------------------------------------------
// Consultas al contexto
// ---------------------------------------------------------------------------

function hayStaff(ctx: ContextoChat): boolean {
  return ctx.opciones.some((o) => o.staff !== null);                              // aporta: el negocio tiene equipo
}

function opcion(ctx: ContextoChat, staffId: string | null): OpcionStaff | undefined {
  return ctx.opciones.find((o) => (o.staff?.id ?? null) === staffId);             // aporta: la de esa persona (o la única sin staff)
}

function diasConLugar(ctx: ContextoChat, staffId: string | null): Dia[] {
  return (opcion(ctx, staffId)?.dias ?? []).filter((d) => libres(d).length > 0);  // aporta: solo días con algo libre
}

function diaElegido(ctx: ContextoChat, e: EstadoChat): Dia | undefined {
  return opcion(ctx, e.staffId)?.dias.find((d) => d.fecha === e.fecha);          // aporta: el día elegido, con los datos más nuevos
}

function huecoLibre(ctx: ContextoChat, e: EstadoChat): Hueco | undefined {
  return diaElegido(ctx, e)?.huecos.find((h) => h.inicio === e.inicio && h.libre); // aporta: sigue libre (pudo ocuparse)
}

function nombreStaff(ctx: ContextoChat, staffId: string | null): string | null {
  return opcion(ctx, staffId)?.staff?.nombre ?? null;                             // aporta: "Ana", o null sin staff
}

function horaDe(ctx: ContextoChat, e: EstadoChat): string {
  return diaElegido(ctx, e)?.huecos.find((h) => h.inicio === e.inicio)?.hora ?? ""; // aporta: "10:30" local del negocio
}

function conTelefono(ctx: ContextoChat, antes: string): string {
  return ctx.telefono                                                             // aporta: el negocio publicó teléfono
    ? `${antes} Puedes llamar a ${ctx.negocio} al ${ctx.telefono}.`               // aporta: la salida cuando no sabe
    : `${antes} Por aquí solo puedo ayudarte a agendar.`;                         // aporta: sin teléfono, lo dice claro
}

// ---------------------------------------------------------------------------
// Preguntas de cada paso
// ---------------------------------------------------------------------------

// Arma el turno que pregunta lo que toca en el paso actual.
export function preguntar(ctx: ContextoChat, e: EstadoChat, antes: string[] = []): Turno {
  const t = (mensajes: string[], botones: Boton[] = []): Turno =>                // aporta: atajo para armar el turno
    ({ estado: e, mensajes: [...antes, ...mensajes], botones });
  switch (e.paso) {
    case "staff": {
      const conLugar = ctx.opciones.filter((o) => o.staff && o.dias.some((d) => libres(d).length > 0)); // aporta: solo quien tiene horarios
      return t(["¿Con quién quieres tu cita?"],
        conLugar.map((o) => ({ texto: o.staff!.nombre, valor: o.staff!.id })));  // aporta: un botón por persona
    }
    case "dia": {
      const dias = diasConLugar(ctx, e.staffId).slice(0, ctx.maxDias ?? MAX_DIAS); // aporta: los próximos días con lugar
      const con = nombreStaff(ctx, e.staffId);                                    // aporta: para decir "con Ana"
      return t([`¿Qué día te acomoda${con ? ` con ${con}` : ""}? También puedes escribirlo, por ejemplo "mañana" o "viernes".`],
        dias.map((d) => ({ texto: `${diaCorto(d.fecha)} · ${libres(d).length}`, valor: d.fecha }))); // aporta: día y cuántos libres
    }
    case "hora": {
      const dia = diaElegido(ctx, e);                                             // aporta: el día elegido
      const horas = dia ? libres(dia) : [];                                       // aporta: solo horas libres
      return t([`Estas son las horas libres del ${diaLargo(e.fecha!)}. ¿Cuál prefieres?`],
        [...horas.map((h) => ({ texto: h.hora, valor: h.inicio })),               // aporta: un botón por hora
          { texto: "Otro día", valor: "otro dia" }]);                             // aporta: volver a elegir día
    }
    case "nombre":
      return t(["¿A nombre de quién hago la cita?"]);                            // aporta: primer dato
    case "correo":
      return t(["¿A qué correo te mando la confirmación?"]);                     // aporta: segundo dato
    case "telefono":
      return t(["¿Y un teléfono de 10 dígitos por si hay que avisarte algo?"]);  // aporta: tercer dato
    case "confirmar": {
      const con = nombreStaff(ctx, e.staffId);                                    // aporta: con quién, si hay staff
      return t([
        `Reviso: ${ctx.servicio.nombre} el ${diaLargo(e.fecha!)} a las ${horaDe(ctx, e)}${con ? ` con ${con}` : ""}, a nombre de ${e.nombre} (${e.correo}, ${e.telefono}). ¿La confirmo?`,
      ], [{ texto: "Sí, confirmar", valor: "si" }, { texto: "Cambiar algo", valor: "no" }]); // aporta: sí o cambiar
    }
    case "cambiar": {
      const botones: Boton[] = [{ texto: "Día u hora", valor: "cambiar horario" }, { texto: "Mis datos", valor: "cambiar datos" }]; // aporta: lo que se puede cambiar
      if (ctx.opciones.filter((o) => o.staff).length > 1) botones.push({ texto: "Con otra persona", valor: "cambiar persona" }); // aporta: solo si hay a quién
      return t(["¿Qué quieres cambiar?"], botones);
    }
    case "enviando":
      return t(["Un momento, estoy apartando tu cita…"]);                       // aporta: mientras responde la base
    case "listo":
      return t(["Tu cita ya quedó. Si quieres agendar otra, escribe \"empezar\"."], [{ texto: "Agendar otra", valor: "empezar" }]); // aporta: fin del flujo
    case "sin_horarios":
      return t([conTelefono(ctx, "Por ahora no hay horarios libres para agendar en línea.")]); // aporta: sin nada que ofrecer
  }
}

// Saludo y primera pregunta.
export function iniciar(ctx: ContextoChat): Turno {
  const saludo = `Hola, te ayudo a agendar tu cita de ${ctx.servicio.nombre} (${ctx.servicio.duracion_min} min) en ${ctx.negocio}.`; // aporta: qué se agenda
  const conLugar = ctx.opciones.filter((o) => o.dias.some((d) => libres(d).length > 0)); // aporta: opciones con algo libre
  if (conLugar.length === 0) return preguntar(ctx, { ...VACIO, paso: "sin_horarios" }, [saludo]); // aporta: nada que ofrecer
  if (hayStaff(ctx) && conLugar.length > 1) return preguntar(ctx, { ...VACIO, paso: "staff" }, [saludo]); // aporta: hay que elegir persona
  return preguntar(ctx, { ...VACIO, paso: "dia", staffId: conLugar[0]!.staff?.id ?? null }, [saludo]); // aporta: una sola opción: directo al día
}

// ---------------------------------------------------------------------------
// Entender respuestas
// ---------------------------------------------------------------------------

const DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]; // aporta: índice + 1 = día ISO
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]; // aporta: índice + 1 = mes

// Busca el día que el cliente escribió entre los días calculados (incluye los
// que no tienen lugar, para poder decir "ese día ya no hay"). "fuera" = una
// fecha válida que no está en el rango que se ofrece.
export function entenderDia(texto: string, dias: Dia[]): Dia | null | "fuera" {
  const t = normalizar(texto);                                                    // aporta: compara sin acentos ni mayúsculas
  const exacto = dias.find((d) => d.fecha === t);                                 // aporta: valor de un botón
  if (exacto) return exacto;
  if (/\bpasado manana\b/.test(t)) return dias[2] ?? "fuera";                     // aporta: dos días después de hoy
  if (/\bmanana\b/.test(t) && !/\bde la manana\b/.test(t)) return dias[1] ?? "fuera"; // aporta: "mañana" sin "de la mañana"
  if (/\bhoy\b/.test(t)) return dias[0] ?? "fuera";                               // aporta: el primer día calculado es hoy
  const fecha = t.match(/\b(\d{1,2})\s*(?:de\s+([a-z]+)|\/\s*(\d{1,2}))?\b/);     // aporta: "3", "3 de diciembre" o "3/12"
  if (fecha) {
    const dia = Number(fecha[1]);                                                 // aporta: día del mes
    const mes = fecha[2] ? MESES.indexOf(fecha[2]) + 1 : fecha[3] ? Number(fecha[3]) : 0; // aporta: mes, si lo dijo (0 = no lo dijo)
    if (fecha[2] && mes === 0) return null;                                       // aporta: "3 de algo" que no es mes
    const maxDia = mes ? new Date(Date.UTC(2024, mes, 0)).getUTCDate() : 31;      // aporta: días del mes (2024 es bisiesto: 29/02 vale)
    if (dia >= 1 && dia <= maxDia && mes <= 12) {                                 // aporta: fecha que existe ("31/02" no)
      const encontrado = dias.find((d) => Number(d.fecha.slice(8, 10)) === dia && (mes === 0 || Number(d.fecha.slice(5, 7)) === mes)); // aporta: primer día que coincide
      return encontrado ?? "fuera";                                               // aporta: válida pero fuera del rango
    }
    return null;                                                                  // aporta: "45", "3/13" o "31/02" no son fechas
  }
  const semana = DIAS_SEMANA.findIndex((n) => new RegExp(`\\b${n}\\b`).test(t));  // aporta: "el viernes"
  if (semana >= 0) return dias.find((d) => d.diaSemana === semana + 1) ?? "fuera"; // aporta: el próximo con ese nombre
  return null;                                                                    // aporta: no habló de un día
}

// Horas que coinciden con lo escrito: "10", "10:30", "4 pm", "a las 5 de la tarde".
// null = no escribió una hora; [] = hora válida pero sin lugar.
export function entenderHora(texto: string, huecos: Hueco[]): Hueco[] | null {
  const exacto = huecos.find((h) => h.inicio === texto.trim());                   // aporta: valor de un botón (ISO)
  if (exacto) return [exacto];
  const t = normalizar(texto);                                                    // aporta: compara sin acentos
  const m = t.match(/\b(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(a ?m|p ?m|de la manana|de la tarde|de la noche|hrs?|horas)?\b/); // aporta: hora, minutos y "am/pm"
  if (!m) return null;                                                            // aporta: no escribió una hora
  let hora = Number(m[1]);                                                        // aporta: la hora escrita
  const minuto = m[2] !== undefined ? Number(m[2]) : null;                        // aporta: minutos, si los dijo
  const sufijo = (m[3] ?? "").replace(/\s/g, "");                                 // aporta: "pm", "am", "delatarde"…
  if (hora > 23 || (minuto !== null && minuto > 59)) return null;                 // aporta: no es una hora válida
  const meridiano = /am|pm|manana|tarde|noche/.test(sufijo);                      // aporta: dijo am/pm o "de la tarde"
  if (meridiano && (hora < 1 || hora > 12)) return null;                          // aporta: "13 pm" o "0 de la tarde" no existen
  if (/pm|tarde|noche/.test(sufijo) && hora < 12) hora += 12;                     // aporta: 4 pm -> 16
  if (/am|manana/.test(sufijo) && hora === 12) hora = 0;                          // aporta: 12 am -> 0
  const sinMeridiano = !sufijo || /hrs?|horas/.test(sufijo);                      // aporta: no dijo am/pm
  const candidatas = sinMeridiano && hora >= 1 && hora <= 7 ? [hora, hora + 12] : [hora]; // aporta: "4" puede ser 4 o 16
  return huecos.filter((h) => {
    const [hh, mm] = h.hora.split(":").map(Number);                               // aporta: hora local del hueco
    return candidatas.includes(hh!) && (minuto === null || mm === minuto);        // aporta: misma hora (y minutos si los dijo)
  });
}

const SI = /^(si|sip|claro|ok|okay|va|dale|confirmo|confirmar|correcto|de acuerdo|esta bien)\b/; // aporta: formas de decir sí (al inicio)
const NO = /\b(no|nop|cambiar|cambia|cambio|espera|pero|mejor)\b/;                // aporta: negación o duda en cualquier parte: "claro que no", "sí pero…"

// Preguntas comunes que no son parte del flujo. Regresa la respuesta o null.
function preguntaComun(ctx: ContextoChat, t: string): string | null {
  if (/\b(telefono|llamar|llamo|whats ?app|hablar con|persona real|humano|asesor)\b/.test(t)) // aporta: quiere hablar con alguien
    return conTelefono(ctx, "Claro.");
  if (/\b(donde|direccion|ubicacion|como llego|domicilio)\b/.test(t))             // aporta: dónde está el negocio
    return ctx.direccion ? `Estamos en ${ctx.direccion}.` : conTelefono(ctx, "No tengo la dirección.");
  if (/\b(cuanto dura|duracion|cuanto tiempo)\b/.test(t))                         // aporta: cuánto dura
    return `La cita de ${ctx.servicio.nombre} dura ${ctx.servicio.duracion_min} minutos.`;
  if (/\b(precio|cuesta|costo|cobran|cuanto es|pago|pagar|tarjeta|efectivo)\b/.test(t)) // aporta: precios: no los conoce
    return conTelefono(ctx, "No tengo los precios.");
  return null;                                                                    // aporta: no es pregunta común
}

// ---------------------------------------------------------------------------
// Responder
// ---------------------------------------------------------------------------

// Avanza la conversación con lo que escribió el cliente (o el valor de un botón).
export function responder(ctx: ContextoChat, e: EstadoChat, entrada: string): Turno {
  const t = normalizar(entrada);                                                  // aporta: texto comparable
  if (!t) return preguntar(ctx, e);                                               // aporta: vacío: repite la pregunta
  if (e.paso === "enviando") return preguntar(ctx, e);                            // aporta: no se cambia nada mientras guarda
  if (/^(empezar|reiniciar|empezar de nuevo|de nuevo|otra vez|agendar otra)$/.test(t)) return iniciar(ctx); // aporta: volver a empezar

  const sinPreguntas = ["nombre", "correo", "telefono", "cambiar"].includes(e.paso); // aporta: aquí el texto es un dato o "cambiar teléfono"
  const comun = sinPreguntas ? null : preguntaComun(ctx, t);                      // aporta: un nombre como "Dulce" no dispara preguntas
  if (comun) return preguntar(ctx, e, [comun]);                                   // aporta: responde y repite la pregunta del paso

  const noEntiendo = (mensaje = "No te entendí.") =>                              // aporta: la salida cuando no sabe
    preguntar(ctx, e, [conTelefono(ctx, `${mensaje} Elige una opción o escríbelo de otra forma.`)]);

  switch (e.paso) {
    case "staff": {
      const elegido = ctx.opciones.find((o) => o.staff && (o.staff.id === entrada.trim() || normalizar(o.staff.nombre) === t || normalizar(o.staff.nombre).startsWith(t))); // aporta: botón o nombre escrito
      if (!elegido) return noEntiendo("No encontré a esa persona.");
      if (diasConLugar(ctx, elegido.staff!.id).length === 0)                      // aporta: esa persona no tiene horarios
        return preguntar(ctx, e, [`${elegido.staff!.nombre} no tiene horarios libres por ahora.`]);
      return preguntar(ctx, { ...e, staffId: elegido.staff!.id, fecha: null, inicio: null, paso: "dia" }); // aporta: ahora el día
    }
    case "dia": {
      const dias = opcion(ctx, e.staffId)?.dias ?? [];                            // aporta: todos los días calculados
      const dia = entenderDia(entrada, dias);                                     // aporta: qué día dijo
      if (dia === "fuera") return preguntar(ctx, e, dias.length ? [`Solo puedo agendar hasta el ${diaLargo(dias[dias.length - 1]!.fecha)}.`] : []); // aporta: fuera del rango
      if (!dia) return noEntiendo();
      if (libres(dia).length === 0) return preguntar(ctx, e, [`El ${diaLargo(dia.fecha)} ya no hay horarios libres.`]); // aporta: día lleno o cerrado
      return preguntar(ctx, { ...e, fecha: dia.fecha, inicio: null, paso: "hora" }); // aporta: ahora la hora
    }
    case "hora": {
      if (/\b(otro dia|cambiar dia|otra fecha)\b/.test(t)) return preguntar(ctx, { ...e, fecha: null, inicio: null, paso: "dia" }); // aporta: volver al día
      const dia = diaElegido(ctx, e);                                             // aporta: día elegido
      const opciones = entenderHora(entrada, dia ? libres(dia) : []);             // aporta: horas libres que coinciden
      if (opciones === null) return noEntiendo();
      if (opciones.length === 0) return preguntar(ctx, e, ["A esa hora no hay lugar."]); // aporta: hora válida pero ocupada o cerrada
      if (opciones.length > 1)                                                    // aporta: "a las 10" con 10:00 y 10:45
        return { estado: e, mensajes: [`A esa hora tengo ${opciones.map((h) => h.hora).join(" y ")}. ¿Cuál prefieres?`], botones: opciones.map((h) => ({ texto: h.hora, valor: h.inicio })) };
      const conHora = { ...e, inicio: opciones[0]!.inicio };                      // aporta: hora elegida
      if (e.editando && e.nombre && e.correo && e.telefono)                       // aporta: vino de "cambiar": ya tenía sus datos
        return preguntar(ctx, { ...conHora, paso: "confirmar", editando: false });
      return preguntar(ctx, { ...conHora, paso: "nombre" });                      // aporta: ahora los datos
    }
    case "nombre":
    case "correo":
    case "telefono": {
      const r = validarCampo(e.paso, entrada);                                    // aporta: mismas reglas que el formulario y la base
      if (!r.ok) return preguntar(ctx, e, [r.error]);                             // aporta: dice qué corregir y vuelve a pedir
      const siguiente: Paso = e.soloUno ? "confirmar"                              // aporta: corrigió un solo dato: de vuelta al resumen
        : e.paso === "nombre" ? "correo" : e.paso === "correo" ? "telefono" : "confirmar"; // aporta: nombre -> correo -> teléfono -> confirmar
      const fin = siguiente === "confirmar";                                       // aporta: al confirmar se acaba la edición
      return preguntar(ctx, { ...e, [e.paso]: r.valor, paso: siguiente, editando: fin ? false : e.editando, soloUno: false }); // aporta: guarda el dato limpio
    }
    case "confirmar": {
      if (SI.test(t) && !NO.test(t)) {                                            // aporta: solo un sí sin "no" ni "pero" envía la cita
        const hueco = huecoLibre(ctx, e);                                         // aporta: revisa con los datos más nuevos
        if (!hueco) return preguntar(ctx, { ...e, inicio: null, paso: "hora" }, ["Ese horario se acaba de ocupar."]); // aporta: alguien lo tomó
        return {
          estado: { ...e, paso: "enviando" },                                     // aporta: espera a la base
          mensajes: ["Un momento, estoy apartando tu cita…"],                     // aporta: aviso mientras guarda
          botones: [],                                                            // aporta: sin botones mientras guarda
          enviar: { inicio: hueco.inicio, staffId: e.staffId, nombre: e.nombre, correo: e.correo, telefono: e.telefono }, // aporta: lo que va a reservar_cita
        };
      }
      if (NO.test(t)) return preguntar(ctx, { ...e, paso: "cambiar" });         // aporta: qué cambiar
      return noEntiendo("Responde sí para confirmar o \"cambiar algo\".");
    }
    case "cambiar": {
      if (/persona|quien/.test(t) && hayStaff(ctx)) return preguntar(ctx, { ...e, staffId: null, fecha: null, inicio: null, paso: "staff", editando: true }); // aporta: otra persona
      if (/horario|hora|dia|fecha/.test(t)) return preguntar(ctx, { ...e, fecha: null, inicio: null, paso: "dia", editando: true }); // aporta: se conservan los datos
      const uno = (["nombre", "correo", "telefono"] as const).find((c) => t.includes(c)); // aporta: "cambiar mi correo"
      if (uno) return preguntar(ctx, { ...e, paso: uno, soloUno: true });         // aporta: corrige solo ese dato
      if (/datos/.test(t)) return preguntar(ctx, { ...e, paso: "nombre", editando: true }); // aporta: los tres, conservando el horario
      return noEntiendo();
    }
    case "listo":
    case "sin_horarios":
      return noEntiendo();                                                        // aporta: aquí ya no hay flujo
  }
}

// ---------------------------------------------------------------------------
// Respuesta de la base
// ---------------------------------------------------------------------------

// Traduce lo que regresó la acción reservar al siguiente turno del chat.
export function alReservar(ctx: ContextoChat, e: EstadoChat, r: ResultadoReserva): Turno {
  if (r.tipo === "reservada") {
    const con = nombreStaff(ctx, e.staffId);                                      // aporta: con quién quedó
    const mensajes = [`Listo, tu cita quedó apartada: ${diaLargo(e.fecha!)} a las ${horaDe(ctx, e) || "la hora elegida"}${con ? ` con ${con}` : ""}.`]; // aporta: resumen
    mensajes.push(r.correoEnviadoA ? `Te mandé la confirmación a ${r.correoEnviadoA}.` : "Guarda el enlace de abajo: con él puedes cancelar."); // aporta: mismo correo que el formulario
    return { estado: { ...e, paso: "listo" }, mensajes, botones: [], enlaceCancelar: r.enlaceCancelar };
  }
  if (r.codigo && ERRORES_DE_HORARIO.has(r.codigo))                               // aporta: el horario ya no sirve
    return preguntar(ctx, { ...e, inicio: null, editando: true, paso: diasConLugar(ctx, e.staffId).length ? "dia" : "sin_horarios" }, [mensajeDeError(r.codigo)]);
  if (r.codigo === "staff_invalido")                                              // aporta: desactivaron a la persona
    return preguntar(ctx, { ...e, staffId: null, fecha: null, inicio: null, editando: true, paso: hayStaff(ctx) ? "staff" : "dia" }, [mensajeDeError(r.codigo)]);
  const campo = r.errores ? (["nombre", "correo", "telefono"] as const).find((c) => r.errores![c]) : undefined; // aporta: primer dato con error
  if (campo) return preguntar(ctx, { ...e, paso: campo, soloUno: true }, [r.errores![campo]!]); // aporta: lo vuelve a pedir y regresa al resumen
  return preguntar(ctx, { ...e, paso: "confirmar" }, [conTelefono(ctx, r.mensaje)]); // aporta: error desconocido: puede reintentar o llamar
}
