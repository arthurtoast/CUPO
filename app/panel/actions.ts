"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import {
  codigoDeCancelacionNegocio,
  mensajeDeCancelacionNegocio,
  validarNota,
} from "@/lib/cancelacion";
import { baseDeEnlaces } from "@/lib/config-correo";
import { avisoCancelacionPorNegocio } from "@/lib/correos";
import { origenDesdeHeaders, enlacePublico } from "@/lib/enlace";
import { correosConfigurados, enviarCorreos } from "@/lib/enviar-correo";
import { createClient } from "@/lib/supabase/server";

export type EstadoCancelarCita =
  | { tipo: "inicial" }
  | { tipo: "cancelada"; avisoEnviadoA: string | null }
  | { tipo: "error"; mensaje: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FilaCancelada = {
  cita_id: string;
  inicio: string;
  nombre_cliente: string;
  correo_cliente: string;
  servicio_nombre: string;
  duracion_min: number;
};

// HU-15: el negocio cancela una cita de su agenda y el cliente recibe un correo.
// cancelar_cita_negocio corre con la sesión del dueño (RLS): solo encuentra sus
// propias citas.
export async function cancelarCitaNegocio(
  _anterior: EstadoCancelarCita,
  formData: FormData,
): Promise<EstadoCancelarCita> {
  const citaId = String(formData.get("cita_id") ?? "");
  if (!UUID.test(citaId)) {
    return { tipo: "error", mensaje: mensajeDeCancelacionNegocio("cita_no_encontrada") };
  }
  const validacion = validarNota(formData.get("nota"));
  if (!validacion.ok) return { tipo: "error", mensaje: validacion.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("cancelar_cita_negocio", { p_cita_id: citaId })
    .single<FilaCancelada>();

  if (error || !data) {
    const codigo = codigoDeCancelacionNegocio(error);
    if (codigo === "desconocido") console.error("cancelar_cita_negocio falló", error);
    refresh();
    return { tipo: "error", mensaje: mensajeDeCancelacionNegocio(codigo) };
  }

  const [{ data: claims }, { data: negocio }, encabezados] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("negocio")
      .select("nombre, slug, zona_horaria, telefono_publico, direccion, correo_contacto")
      .maybeSingle(),
    headers(),
  ]);

  if (negocio) {
    const base = baseDeEnlaces(process.env, origenDesdeHeaders(encabezados));
    const correo = avisoCancelacionPorNegocio(
      {
        negocio: {
          nombre: negocio.nombre,
          telefono: negocio.telefono_publico,
          direccion: negocio.direccion,
          zonaHoraria: negocio.zona_horaria,
        },
        servicio: { nombre: data.servicio_nombre, duracionMin: data.duracion_min },
        cliente: { nombre: data.nombre_cliente, correo: data.correo_cliente },
        inicio: data.inicio,
        nota: validacion.nota,
        enlaceReservar: enlacePublico(base, negocio.slug),
      },
      // Si el cliente responde, le escribe al negocio.
      negocio.correo_contacto ?? (typeof claims?.claims?.email === "string" ? claims.claims.email : null),
    );
    // El correo sale después de responder: la agenda se actualiza sin esperar al
    // servidor de correo, y si falla, la cita ya quedó cancelada.
    after(() => enviarCorreos([correo]).then(() => undefined));
  } else {
    console.error("Cita cancelada sin aviso: no se pudo leer el negocio");
  }

  refresh();
  return {
    tipo: "cancelada",
    avisoEnviadoA: negocio && correosConfigurados() ? data.correo_cliente : null,
  };
}
