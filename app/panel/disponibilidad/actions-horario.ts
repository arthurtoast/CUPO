"use server";

import { revalidatePath } from "next/cache";
import { NOMBRES_DIA, validarHorario, type Bloque, type Dia } from "@/lib/horario";
import { createClient } from "@/lib/supabase/server";

export type EstadoHorario = {
  guardado?: boolean;
  error?: string;
  errores?: Record<number, string>;
};

// Lo que llega del navegador no es confiable: se revisa la forma antes de validar.
function esHorario(valor: unknown): valor is Dia[] {
  return (
    Array.isArray(valor) &&
    valor.length === NOMBRES_DIA.length &&
    valor.every(
      (dia) =>
        typeof dia?.abierto === "boolean" &&
        Array.isArray(dia.bloques) &&
        dia.bloques.every(
          (b: unknown) =>
            typeof (b as Bloque)?.inicio === "string" && typeof (b as Bloque)?.fin === "string",
        ),
    )
  );
}

export async function guardarHorario(
  _anterior: EstadoHorario,
  dias: Dia[],
): Promise<EstadoHorario> {
  if (!esHorario(dias)) return { error: "No pudimos leer el horario. Recarga la página." };

  const errores = validarHorario(dias);
  if (Object.keys(errores).length > 0) {
    return { error: "Revisa los días marcados antes de guardar.", errores };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const negocioId = data?.claims?.sub;
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const nuevos = dias.flatMap((dia, i) =>
    dia.abierto
      ? dia.bloques.map((b) => ({
          negocio_id: negocioId,
          dia_semana: i + 1,
          hora_inicio: b.inicio,
          hora_fin: b.fin,
        }))
      : [],
  );

  // Se reemplaza el horario completo: primero se borra para que la exclusión
  // horario_sin_traslape no choque con los bloques viejos. Se guarda una copia
  // para restaurarla si la inserción falla y el negocio no se quede sin horario.
  const { data: anteriores, error: errorLeer } = await supabase
    .from("horario_atencion")
    .select("negocio_id, dia_semana, hora_inicio, hora_fin")
    .eq("negocio_id", negocioId);
  if (errorLeer) return { error: "No pudimos guardar el horario. Intenta de nuevo." };

  const { error: errorBorrar } = await supabase
    .from("horario_atencion")
    .delete()
    .eq("negocio_id", negocioId);
  if (errorBorrar) return { error: "No pudimos guardar el horario. Intenta de nuevo." };

  if (nuevos.length > 0) {
    const { error } = await supabase.from("horario_atencion").insert(nuevos);
    if (error) {
      if (anteriores.length > 0) await supabase.from("horario_atencion").insert(anteriores);
      if (error.code === "23P01") {
        return {
          error:
            "Dos bloques del mismo día se enciman. Ajusta las horas para que uno termine antes de que empiece el otro.",
        };
      }
      if (error.code === "23514") {
        return { error: "Cada bloque debe cerrar después de la hora en que abre." };
      }
      return { error: "No pudimos guardar el horario. Intenta de nuevo." };
    }
  }

  revalidatePath("/panel/disponibilidad");
  return { guardado: true };
}
