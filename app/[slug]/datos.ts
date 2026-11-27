// Solo se importa desde componentes de servidor (usa cookies de la petición).
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BloqueHorario } from "@/lib/huecos";
import type { MiembroStaff, OcupadoConStaff } from "@/lib/staff";

// Lecturas de la página pública. Solo usan las vistas públicas (T-04): el
// visitante no tiene permiso sobre las tablas.

export type Marca = {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  logo_url: string | null;
  color_acento: string | null;
  telefono_publico: string | null;
  direccion: string | null;
  zona_horaria: string;
  // HU-16
  portada_url: string | null;
  bienvenida: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
};

export type Servicio = {
  id: string;
  nombre: string;
  duracion_min: number;
};

export type DatosReserva = {
  servicio: Servicio | null;
  horario: BloqueHorario[];
  ocupados: OcupadoConStaff[]; // con staff_id y bloqueo para filtrar por persona (HU-18)
  staff: MiembroStaff[]; // staff activo; vacío si el negocio no tiene
};

// cache() comparte la consulta entre generateMetadata y la página en la misma
// petición; no guarda nada entre peticiones.
export const leerMarca = cache(async (slug: string): Promise<Marca | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vista_marca")
    .select(
      "id, slug, nombre, descripcion, logo_url, color_acento, telefono_publico, direccion, zona_horaria, portada_url, bienvenida, instagram, facebook, whatsapp",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el negocio: ${error.message}`);
  return data;
});

// hasta: solo hacen falta los ocupados dentro de los días que se muestran.
export async function leerDatosReserva(negocioId: string, hasta: Date): Promise<DatosReserva> {
  const supabase = await createClient();
  const [servicio, horario, ocupados, staff] = await Promise.all([
    // En el MVP hay un servicio activo; si hubiera más, se usa el más antiguo,
    // igual que reservar_cita cuando no recibe p_servicio_id.
    supabase
      .from("vista_servicio")
      .select("id, nombre, duracion_min")
      .eq("negocio_id", negocioId)
      .order("creado_en", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("vista_horario")
      .select("dia_semana, hora_inicio, hora_fin")
      .eq("negocio_id", negocioId),
    supabase
      .from("vista_ocupado")
      .select("inicio, fin, staff_id, bloqueo")
      .eq("negocio_id", negocioId)
      .lt("inicio", hasta.toISOString()),
    // HU-18: en el orden en que el negocio los registró.
    supabase
      .from("vista_staff")
      .select("id, nombre")
      .eq("negocio_id", negocioId)
      .order("creado_en", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  for (const r of [servicio, horario, ocupados, staff]) {
    if (r.error) throw new Error(`No se pudo leer la disponibilidad: ${r.error.message}`);
  }

  return {
    servicio: servicio.data,
    horario: horario.data ?? [],
    ocupados: ocupados.data ?? [],
    staff: staff.data ?? [],
  };
}
