"use server";

import { refresh } from "next/cache";
import { mensajeDeErrorBloqueo, validarBloqueo } from "@/lib/bloqueos";
import { claveDia } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";

export type EstadoBloqueo = {
  error?: string;
  creados?: number;
  citasAfectadas?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// HU-05: crea bloqueos con crear_bloqueos. La función corre con la sesión del
// dueño, así que RLS impide escribir en otro negocio.
export async function crearBloqueo(
  _anterior: EstadoBloqueo,
  formData: FormData,
): Promise<EstadoBloqueo> {
  const supabase = await createClient();

  // "Hoy" en la zona del negocio, para no aceptar fechas que ya pasaron.
  const { data: negocio } = await supabase.from("negocio").select("zona_horaria").maybeSingle();
  const hoy = claveDia(new Date(), negocio?.zona_horaria ?? "America/Monterrey");

  const validacion = validarBloqueo(
    {
      desde: formData.get("desde"),
      hasta: formData.get("hasta"),
      modo: formData.get("modo"),
      horaInicio: formData.get("hora_inicio"),
      horaFin: formData.get("hora_fin"),
      motivo: formData.get("motivo"),
    },
    hoy,
  );
  if (!validacion.ok) return { error: validacion.error };
  const d = validacion.datos;

  const { data, error } = await supabase
    .rpc("crear_bloqueos", {
      p_desde: d.desde,
      p_hasta: d.hasta,
      p_hora_inicio: d.horaInicio,
      p_hora_fin: d.horaFin,
      p_motivo: d.motivo,
    })
    .single<{ creados: number; serie: string | null; citas_afectadas: number }>();

  if (error || !data) {
    if (!error?.message || mensajeDeErrorBloqueo(error).startsWith("No pudimos")) {
      console.error("crear_bloqueos falló", error);
    }
    return { error: mensajeDeErrorBloqueo(error) };
  }

  refresh();
  return { creados: data.creados, citasAfectadas: data.citas_afectadas };
}

// Quita un bloqueo suelto (id) o todos los días de una franja (serie).
// RLS limita el borrado a los bloqueos del propio negocio.
export async function quitarBloqueo(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const serie = String(formData.get("serie") ?? "");
  const supabase = await createClient();

  if (UUID.test(serie)) {
    const { error } = await supabase.from("bloqueo").delete().eq("serie", serie);
    if (error) console.error("No se pudo quitar la serie de bloqueos", error);
  } else if (UUID.test(id)) {
    const { error } = await supabase.from("bloqueo").delete().eq("id", id);
    if (error) console.error("No se pudo quitar el bloqueo", error);
  }
  refresh();
}
