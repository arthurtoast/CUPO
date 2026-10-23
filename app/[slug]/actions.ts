"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { baseDeEnlaces } from "@/lib/config-correo";
import { origenDesdeHeaders } from "@/lib/enlace";
import { correosConfigurados } from "@/lib/enviar-correo";
import { createClient } from "@/lib/supabase/server";
import { notificarCitaNueva } from "./notificar";
import {
  ERRORES_DE_HORARIO,
  codigoDeError,
  mensajeDeError,
  validarDatos,
  type CampoCliente,
  type CodigoError,
} from "@/lib/reserva";

export type EstadoReserva =
  | { tipo: "inicial" }
  | {
      tipo: "error";
      mensaje: string;
      codigo?: CodigoError;
      errores?: Partial<Record<CampoCliente, string>>;
      // Hueco que la base rechazó; la página lo deselecciona.
      inicioRechazado?: string;
    }
  | {
      tipo: "reservada";
      inicio: string;
      fin: string;
      // HU-12: el enlace también se muestra en pantalla, por si el correo no llega.
      enlaceCancelar: string;
      // Correo al que se envió la confirmación; null si no hay SMTP configurado.
      correoEnviadoA: string | null;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// HU-10 y HU-11: crea la cita con reservar_cita. La base valida otra vez todo
// (datos, horario, rejilla, bloqueos) y la restricción de exclusión impide que
// dos personas se queden con el mismo hueco aunque confirmen al mismo tiempo.
export async function reservar(
  _anterior: EstadoReserva,
  formData: FormData,
): Promise<EstadoReserva> {
  const slug = String(formData.get("slug") ?? "");
  const servicioId = String(formData.get("servicio_id") ?? "");
  const inicio = String(formData.get("inicio") ?? "");

  if (!inicio || Number.isNaN(Date.parse(inicio))) {
    return { tipo: "error", mensaje: "Elige un día y una hora." };
  }

  const validacion = validarDatos({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    telefono: formData.get("telefono"),
  });
  if (!validacion.ok) {
    return { tipo: "error", mensaje: "Revisa tus datos.", errores: validacion.errores };
  }
  const { nombre, correo, telefono } = validacion.datos;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reservar_cita", {
      p_slug: slug,
      p_inicio: inicio,
      p_nombre: nombre,
      p_correo: correo,
      p_telefono: telefono,
      p_servicio_id: UUID.test(servicioId) ? servicioId : null,
    })
    .single<{ cita_id: string; token_cancelacion: string; inicio: string; fin: string }>();

  if (error || !data) {
    const codigo = codigoDeError(error);
    if (codigo === "desconocido") {
      console.error("reservar_cita falló", error);
    }
    if (ERRORES_DE_HORARIO.has(codigo)) {
      // Vuelve a pedir la página para que el hueco aparezca ocupado.
      refresh();
      return { tipo: "error", mensaje: mensajeDeError(codigo), codigo, inicioRechazado: inicio };
    }
    return { tipo: "error", mensaje: mensajeDeError(codigo), codigo };
  }

  // HU-12: el enlace de cancelación lleva el token. Solo lo ve quien reservó:
  // en su pantalla de confirmación y en su correo.
  const base = baseDeEnlaces(process.env, origenDesdeHeaders(await headers()));
  const enlaceCancelar = `${base}/cancelar/${data.token_cancelacion}`;
  const servicio = UUID.test(servicioId) ? servicioId : null;

  // Los correos salen después de responder: el cliente no espera al servidor
  // de correo y, si falla, la cita ya quedó guardada.
  after(() =>
    notificarCitaNueva({
      slug,
      servicioId: servicio,
      inicio: data.inicio,
      cliente: { nombre, correo, telefono },
      enlaceCancelar,
      enlaceAgenda: `${base}/panel`,
    }),
  );

  refresh();
  return {
    tipo: "reservada",
    inicio: data.inicio,
    fin: data.fin,
    enlaceCancelar,
    correoEnviadoA: correosConfigurados() ? correo : null,
  };
}
