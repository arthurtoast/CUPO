// Contenido de los correos de una cita nueva (HU-12):
//   * al cliente: confirmación con fecha, hora, negocio y el enlace para cancelar;
//   * al negocio: aviso con los datos del cliente.
//
// Solo arma los correos (asunto, texto plano y HTML); el envío está en
// lib/enviar-correo.ts. Sin dependencias, para probarlo con `node --test`.

export type DatosCita = {
  negocio: {
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    zonaHoraria: string;
  };
  servicio: { nombre: string; duracionMin: number };
  cliente: { nombre: string; correo: string; telefono: string };
  inicio: string; // ISO 8601
  enlaceCancelar: string;
  enlaceAgenda: string;
};

export type Correo = {
  para: string;
  responderA: string | null;
  asunto: string;
  texto: string;
  html: string;
};

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

// "Jueves, 29 de octubre, 10:30" en la hora del negocio.
export function fechaDeCita(inicio: string, zona: string): string {
  const texto = new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(inicio));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// La base guarda solo dígitos; los de 10 se leen como 81 1234 5678.
export function telefonoLegible(telefono: string): string {
  return /^\d{10}$/.test(telefono)
    ? `${telefono.slice(0, 2)} ${telefono.slice(2, 6)} ${telefono.slice(6)}`
    : telefono;
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Un asunto es una sola línea: cualquier salto se vuelve espacio.
function unaLinea(texto: string): string {
  return texto.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

type Fila = [etiqueta: string, valor: string, enlace?: string];

function filasTexto(filas: Fila[]): string {
  return filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`).join("\n");
}

function filasHtml(filas: Fila[]): string {
  return filas
    .map(([etiqueta, valor, enlace]) => {
      const contenido = enlace
        ? `<a href="${escaparHtml(enlace)}" style="color:#2B5CE6">${escaparHtml(valor)}</a>`
        : escaparHtml(valor);
      return (
        `<tr><td style="padding:4px 16px 4px 0;color:#5C5A52;white-space:nowrap;vertical-align:top">${escaparHtml(etiqueta)}</td>` +
        `<td style="padding:4px 0;color:#1A1A18">${contenido}</td></tr>`
      );
    })
    .join("");
}

function plantillaHtml(titulo: string, cuerpo: string): string {
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#F4F3EF;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5">` +
    `<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E0D8;border-radius:14px;padding:24px">` +
    `<h1 style="margin:0 0 16px;font-size:20px;color:#1A1A18">${escaparHtml(titulo)}</h1>` +
    cuerpo +
    `</div></body></html>`
  );
}

// ---------------------------------------------------------------------------
// Correos
// ---------------------------------------------------------------------------

export function correoParaCliente(datos: DatosCita, responderA: string | null = null): Correo {
  const { negocio, servicio, cliente } = datos;
  const fecha = fechaDeCita(datos.inicio, negocio.zonaHoraria);
  const titulo = "Tu cita quedó apartada";

  const filas: Fila[] = [
    ["Cuándo", fecha],
    ["Servicio", `${servicio.nombre} · ${servicio.duracionMin} min`],
    ["Negocio", negocio.nombre],
  ];
  if (negocio.direccion) filas.push(["Dirección", negocio.direccion]);
  if (negocio.telefono) filas.push(["Teléfono", negocio.telefono, `tel:${negocio.telefono.replace(/[^\d+]/g, "")}`]);

  const texto = [
    `Hola, ${cliente.nombre}:`,
    "",
    `Tu cita en ${negocio.nombre} quedó apartada.`,
    "",
    filasTexto(filas),
    "",
    "Si no vas a poder ir, cancela con este enlace para liberar el horario:",
    datos.enlaceCancelar,
    "",
    "Cualquiera con este enlace puede cancelar la cita: no lo compartas.",
  ].join("\n");

  const html = plantillaHtml(
    titulo,
    `<p style="margin:0 0 16px">Hola, ${escaparHtml(cliente.nombre)}: tu cita en ${escaparHtml(negocio.nombre)} quedó apartada.</p>` +
      `<table role="presentation" style="border-collapse:collapse;margin:0 0 20px">${filasHtml(filas)}</table>` +
      `<p style="margin:0 0 8px">Si no vas a poder ir, cancela para liberar el horario:</p>` +
      `<p style="margin:0 0 20px"><a href="${escaparHtml(datos.enlaceCancelar)}" style="display:inline-block;background:#2B5CE6;color:#FFFFFF;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">Cancelar mi cita</a></p>` +
      `<p style="margin:0;font-size:13px;color:#5C5A52;word-break:break-all">Cualquiera con este enlace puede cancelar la cita: no lo compartas.<br>${escaparHtml(datos.enlaceCancelar)}</p>`,
  );

  return {
    para: cliente.correo,
    responderA,
    asunto: unaLinea(`Tu cita en ${negocio.nombre}: ${fecha}`),
    texto,
    html,
  };
}

export function avisoParaNegocio(datos: DatosCita, para: string): Correo {
  const { negocio, servicio, cliente } = datos;
  const fecha = fechaDeCita(datos.inicio, negocio.zonaHoraria);
  const titulo = "Tienes una cita nueva";
  const telefono = telefonoLegible(cliente.telefono);

  const filas: Fila[] = [
    ["Cuándo", fecha],
    ["Servicio", `${servicio.nombre} · ${servicio.duracionMin} min`],
    ["Cliente", cliente.nombre],
    ["Correo", cliente.correo, `mailto:${cliente.correo}`],
    ["Teléfono", telefono, `tel:${cliente.telefono}`],
  ];

  const texto = [
    `${titulo} en ${negocio.nombre}.`,
    "",
    filasTexto(filas),
    "",
    "Tu agenda:",
    datos.enlaceAgenda,
  ].join("\n");

  const html = plantillaHtml(
    titulo,
    `<table role="presentation" style="border-collapse:collapse;margin:0 0 20px">${filasHtml(filas)}</table>` +
      `<p style="margin:0"><a href="${escaparHtml(datos.enlaceAgenda)}" style="color:#2B5CE6;font-weight:600">Ver mi agenda</a></p>`,
  );

  return {
    para,
    // Responder al aviso le escribe directo al cliente.
    responderA: cliente.correo,
    asunto: unaLinea(`Cita nueva: ${cliente.nombre}, ${fecha}`),
    texto,
    html,
  };
}
