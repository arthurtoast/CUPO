// Envío de correos por SMTP (HU-12). Solo se usa en el servidor.
//
// Un correo que no sale nunca rompe lo que lo disparó: la cita ya está guardada.
// Los fallos se reportan en la consola del servidor, sin el contenido del correo.

import { createTransport, type Transporter } from "nodemailer";
import { leerConfigSmtp, type ConfigSmtp } from "./config-correo";
import type { Correo } from "./correos";

export type ResultadoEnvio = {
  enviados: number;
  fallidos: number;
  omitidos: boolean; // true si no hay SMTP configurado
};

let transporte: { clave: string; transporter: Transporter } | null = null;

// Un solo transporte por configuración; se rehace si cambian las variables.
function obtenerTransporte(config: ConfigSmtp): Transporter {
  const clave = JSON.stringify(config);
  if (transporte?.clave === clave) return transporte.transporter;
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.usuario ? { user: config.usuario, pass: config.contrasena ?? "" } : undefined,
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });
  transporte = { clave, transporter };
  return transporter;
}

export function correosConfigurados(entorno = process.env): boolean {
  return leerConfigSmtp(entorno).ok;
}

export async function enviarCorreos(
  correos: Correo[],
  entorno: Record<string, string | undefined> = process.env,
): Promise<ResultadoEnvio> {
  const resultado = leerConfigSmtp(entorno);
  if (!resultado.ok) {
    if (resultado.motivo === "invalida") {
      console.error(`Correos desactivados: ${resultado.error}`);
    } else {
      console.warn("Correos desactivados: falta SMTP_HOST (ver .env.example)");
    }
    return { enviados: 0, fallidos: 0, omitidos: true };
  }

  const { config } = resultado;
  const transporter = obtenerTransporte(config);

  // Cada correo por separado: si el del negocio falla, el del cliente sale igual.
  const envios = await Promise.allSettled(
    correos.map((c) =>
      transporter.sendMail({
        from: config.remitente,
        to: c.para,
        replyTo: c.responderA ?? undefined,
        subject: c.asunto,
        text: c.texto,
        html: c.html,
      }),
    ),
  );

  let fallidos = 0;
  envios.forEach((envio, i) => {
    if (envio.status === "rejected") {
      fallidos++;
      const dominio = correos[i]!.para.split("@")[1] ?? "?";
      const motivo = envio.reason instanceof Error ? envio.reason.message : String(envio.reason);
      console.error(`No se pudo enviar un correo a @${dominio}: ${motivo}`);
    }
  });

  return { enviados: correos.length - fallidos, fallidos, omitidos: false };
}
