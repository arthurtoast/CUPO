"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoServicio = {
  guardado?: boolean;
  error?: string;
};

// Sprint 1: un solo servicio por negocio. Si no existe se crea; si existe se actualiza.
export async function guardarServicio(
  _anterior: EstadoServicio,
  formData: FormData,
): Promise<EstadoServicio> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const duracion = Number(formData.get("duracion_min"));

  if (nombre.length < 1 || nombre.length > 80) {
    return { error: "Escribe el nombre del servicio (máximo 80 caracteres)." };
  }
  if (!Number.isInteger(duracion) || duracion < 5 || duracion > 480) {
    return { error: "La duración debe ser de 5 a 480 minutos." };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const negocioId = data?.claims?.sub;
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  // El mismo servicio que reservar_cita usa por defecto: el activo más antiguo.
  const { data: actual, error: errorLeer } = await supabase
    .from("servicio")
    .select("id")
    .eq("negocio_id", negocioId)
    .eq("activo", true)
    .order("creado_en")
    .limit(1)
    .maybeSingle();
  if (errorLeer) return { error: "No pudimos guardar el servicio. Intenta de nuevo." };

  const { error } = actual
    ? await supabase
        .from("servicio")
        .update({ nombre, duracion_min: duracion })
        .eq("id", actual.id)
    : await supabase
        .from("servicio")
        .insert({ negocio_id: negocioId, nombre, duracion_min: duracion });
  if (error) return { error: "No pudimos guardar el servicio. Intenta de nuevo." };

  revalidatePath("/panel/disponibilidad");
  return { guardado: true };
}
