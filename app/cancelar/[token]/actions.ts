"use server";

import {
  codigoDeCancelacion,
  esTokenValido,
  mensajeDeCancelacion,
  type CodigoCancelacion,
} from "@/lib/cancelacion";
import { createClient } from "@/lib/supabase/server";

export type EstadoCancelacion =
  | { tipo: "inicial" }
  | { tipo: "cancelada" }
  | { tipo: "error"; codigo: CodigoCancelacion; mensaje: string };

// HU-13: cancela la cita del token con cancelar_por_token. Va como acción (POST)
// y no en la carga de la página (GET) a propósito: los filtros de correo y las
// vistas previas de mensajería abren los enlaces solos, y eso no debe cancelar
// nada. La persona tiene que confirmar con el botón.
export async function cancelarCita(
  _anterior: EstadoCancelacion,
  formData: FormData,
): Promise<EstadoCancelacion> {
  const token = formData.get("token");
  if (!esTokenValido(token)) {
    return { tipo: "error", codigo: "token_invalido", mensaje: mensajeDeCancelacion("token_invalido") };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_por_token", { p_token: token }).single();

  if (error) {
    const codigo = codigoDeCancelacion(error);
    if (codigo === "desconocido") console.error("cancelar_por_token falló", error);
    // Si alguien la canceló un instante antes (otra pestaña), el resultado es
    // el mismo que pidió la persona: se muestra como cancelada.
    if (codigo === "cita_ya_cancelada") return { tipo: "cancelada" };
    return { tipo: "error", codigo, mensaje: mensajeDeCancelacion(codigo) };
  }

  return { tipo: "cancelada" };
}
