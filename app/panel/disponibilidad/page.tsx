import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { MensajeError } from "@/components/formulario";
import { diasDesdeFilas } from "@/lib/horario";
import { createClient } from "@/lib/supabase/server";
import { FormularioHorario } from "./formulario-horario";
import { FormularioServicio } from "./formulario-servicio";

export const metadata: Metadata = { title: "Disponibilidad · Cupo" };

// Lee el horario y el servicio del negocio con sesión; RLS limita las filas a
// negocio_id = auth.uid(), así que no hace falta filtrar por negocio aquí.
async function Configuracion() {
  await connection();
  const supabase = await createClient();

  const [negocio, horario, servicio] = await Promise.all([
    supabase.from("negocio").select("zona_horaria").maybeSingle(),
    supabase.from("horario_atencion").select("dia_semana, hora_inicio, hora_fin"),
    supabase
      .from("servicio")
      .select("nombre, duracion_min")
      .eq("activo", true)
      .order("creado_en")
      .limit(1)
      .maybeSingle(),
  ]);

  // Si la lectura falla no se muestra un horario vacío: guardarlo borraría el real.
  if (negocio.error || horario.error || servicio.error) {
    return (
      <MensajeError mensaje="No pudimos cargar tu disponibilidad. Recarga la página para intentar de nuevo." />
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <FormularioHorario
          inicial={diasDesdeFilas(horario.data)}
          zonaHoraria={negocio.data?.zona_horaria ?? "America/Monterrey"}
        />
      </div>
      <aside className="flex flex-col gap-[18px] lg:w-[368px] lg:shrink-0">
        <FormularioServicio inicial={servicio.data} />
      </aside>
    </div>
  );
}

export default function Disponibilidad() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Disponibilidad</h1>
        <p className="max-w-[640px] text-[15px] text-tinta-suave">
          Define cuándo pueden reservarte. Tus clientes solo verán los huecos libres dentro de
          este horario.
        </p>
      </div>
      <Suspense
        fallback={<p className="text-sm text-tinta-suave">Cargando tu horario…</p>}
      >
        <Configuracion />
      </Suspense>
    </>
  );
}
