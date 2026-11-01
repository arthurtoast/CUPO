import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { MensajeError } from "@/components/formulario";
import { agruparBloqueos, type FilaBloqueo } from "@/lib/bloqueos";
import { claveDia } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";
import { quitarBloqueo } from "./actions";
import { FormularioBloqueo } from "./formulario-bloqueo";

export const metadata: Metadata = { title: "Bloqueos · Cupo" };

// HU-05. Lee los bloqueos que todavía no terminan; RLS limita las filas a
// negocio_id = auth.uid().
async function Bloqueos() {
  await connection();
  const supabase = await createClient();

  const [negocio, bloqueos] = await Promise.all([
    supabase.from("negocio").select("zona_horaria").maybeSingle(),
    supabase
      .from("bloqueo")
      .select("id, inicio, fin, motivo, serie")
      .gt("fin", new Date().toISOString())
      .order("inicio"),
  ]);

  if (negocio.error || bloqueos.error) {
    return <MensajeError mensaje="No pudimos cargar tus bloqueos. Recarga la página para intentar de nuevo." />;
  }

  const zona = negocio.data?.zona_horaria ?? "America/Monterrey";
  const hoy = claveDia(new Date(), zona);
  const entradas = agruparBloqueos((bloqueos.data ?? []) as FilaBloqueo[], zona, hoy);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section aria-labelledby="titulo-lista" className="min-w-0 flex-1 rounded-[14px] border border-borde bg-superficie p-[22px]">
        <h2 id="titulo-lista" className="mb-3 font-display text-base font-bold">Próximos bloqueos</h2>
        {entradas.length === 0 ? (
          <p className="text-sm text-tinta-suave">No tienes bloqueos. Tus clientes ven todo tu horario.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {entradas.map((e) => (
              <li
                key={e.clave}
                className="flex flex-col gap-2 rounded-[10px] border border-[#efede6] bg-[#f7f6f2] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{e.descripcion}</p>
                  {e.motivo && <p className="text-[13px] text-tinta-suave">{e.motivo}</p>}
                </div>
                <form action={quitarBloqueo}>
                  {e.serie ? (
                    <input type="hidden" name="serie" value={e.serie} />
                  ) : (
                    <input type="hidden" name="id" value={e.ids[0]} />
                  )}
                  <button
                    type="submit"
                    className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave"
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="lg:w-[368px] lg:shrink-0">
        <FormularioBloqueo hoy={hoy} />
      </aside>
    </div>
  );
}

export default function PaginaBloqueos() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Bloqueos</h1>
        <p className="max-w-[640px] text-[15px] text-tinta-suave">
          Cierra días completos (vacaciones) u horas que se repiten (una comida, un curso). Las citas
          que ya tienes no se cancelan solas.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando tus bloqueos…</p>}>
        <Bloqueos />
      </Suspense>
    </>
  );
}
