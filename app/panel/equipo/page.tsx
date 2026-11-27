import type { Metadata } from "next";                                              // aporta: título de la pestaña
import { connection } from "next/server";                                         // aporta: lee datos al pedir la página, no al compilar
import { Suspense } from "react";                                                 // aporta: muestra "Cargando…" mientras llega la lista
import { MensajeError } from "@/components/formulario";                           // aporta: aviso de error común
import { createClient } from "@/lib/supabase/server";                             // aporta: cliente con la sesión del dueño (RLS)
import { cambiarActivo } from "./actions";                                        // aporta: activar o desactivar
import { FormularioStaff } from "./formulario-staff";                             // aporta: alta de una persona

export const metadata: Metadata = { title: "Equipo · Cupo" };                     // aporta: título de la pestaña

type FilaStaff = { id: string; nombre: string; activo: boolean };                 // aporta: lo que se lista de cada persona

// HU-18. RLS limita las filas a negocio_id = auth.uid(); el dueño ve también a
// quien desactivó, para poder reactivarlo.
async function Equipo() {
  await connection();                                                             // aporta: datos frescos en cada visita
  const supabase = await createClient();                                          // aporta: conexión con la sesión
  const { data, error } = await supabase                                          // aporta: todo su staff
    .from("staff")
    .select("id, nombre, activo")
    .order("activo", { ascending: false })                                        // aporta: activos primero
    .order("creado_en")                                                           // aporta: mismo orden que la página pública
    .order("id");                                                                 // aporta: desempate estable, igual que vista_staff en la página

  if (error) {                                                                    // aporta: falla de la base
    return <MensajeError mensaje="No pudimos cargar tu equipo. Recarga la página para intentar de nuevo." />;
  }
  const staff = (data ?? []) as FilaStaff[];                                      // aporta: filas tipadas

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section aria-labelledby="titulo-equipo" className="min-w-0 flex-1 rounded-[14px] border border-borde bg-superficie p-[22px]">
        <h2 id="titulo-equipo" className="mb-3 font-display text-base font-bold">Tu equipo</h2>
        {staff.length === 0 ? (                                                    // aporta: negocio sin staff
          <p className="text-sm text-tinta-suave">
            Aún no agregas a nadie. Tu página funciona como siempre: una sola agenda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {staff.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-[10px] border border-[#efede6] bg-[#f7f6f2] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className={`text-[15px] font-semibold ${m.activo ? "" : "text-tinta-suave line-through"}`}>{m.nombre}</p>
                  <p className="text-[13px] text-tinta-suave">
                    {m.activo ? "Recibe reservas" : "Desactivada: no se ofrece a tus clientes"}  {/* aporta: estado en palabras */}
                  </p>
                </div>
                <form action={cambiarActivo}>                                      {/* aporta: un botón por persona */}
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="activo" value={String(!m.activo)} />  {/* aporta: el estado contrario */}
                  <button
                    type="submit"
                    aria-label={`${m.activo ? "Desactivar" : "Reactivar"} a ${m.nombre}`}
                    className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave"
                  >
                    {m.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="lg:w-[368px] lg:shrink-0">
        <FormularioStaff />
      </aside>
    </div>
  );
}

export default function PaginaEquipo() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Equipo</h1>
        <p className="max-w-[640px] text-[15px] text-tinta-suave">
          Si atienden varias personas, cada una tiene su propia agenda: dos clientes pueden reservar a
          la misma hora con personas distintas. Desactivar a alguien no cancela sus citas.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando tu equipo…</p>}>
        <Equipo />
      </Suspense>
    </>
  );
}
