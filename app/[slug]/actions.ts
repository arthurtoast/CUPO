"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  | { tipo: "reservada"; inicio: string; fin: string };

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

  // El token de cancelación no se manda al navegador: viaja en el correo de
  // confirmación (HU-12, HU-13).
  refresh();
  return { tipo: "reservada", inicio: data.inicio, fin: data.fin };
}
