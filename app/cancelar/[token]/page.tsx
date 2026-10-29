import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { esTokenValido, estadoDeCita } from "@/lib/cancelacion";
import { fechaDeCita } from "@/lib/correos";
import { createClient } from "@/lib/supabase/server";
import { FormularioCancelar } from "./formulario-cancelar";

// El enlace lleva el token: que no lo indexen los buscadores ni se mande en el
// encabezado Referer al salir hacia otra página.
export const metadata: Metadata = {
  title: "Cancelar cita · Cupo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const COLOR_POR_DEFECTO = "#2B5CE6";

type CitaPorToken = {
  estado: string;
  inicio: string;
  fin: string;
  cancelada_en: string | null;
  nombre_cliente: string;
  servicio_nombre: string;
  negocio_nombre: string;
  negocio_slug: string;
  zona_horaria: string;
  telefono_publico: string | null;
  direccion: string | null;
  color_acento: string | null;
};

// HU-13: página a la que lleva el enlace del correo de confirmación (HU-12).
// El token es dato de la petición, por eso todo va dentro de <Suspense>.
export default function PaginaCancelar({ params }: PageProps<"/cancelar/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-8">
      <Suspense fallback={<p className="text-sm text-tinta-suave">Buscando tu cita…</p>}>
        <Cancelacion params={params} />
      </Suspense>
    </main>
  );
}

async function Cancelacion({ params }: { params: PageProps<"/cancelar/[token]">["params"] }) {
  const { token } = await params;
  // Si la cita está vigente o ya pasó depende de la hora: nunca se prerenderiza.
  await connection();

  if (!esTokenValido(token)) return <EnlaceInvalido />;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("cita_por_token", { p_token: token })
    .maybeSingle<CitaPorToken>();
  if (error) throw new Error(`No se pudo leer la cita: ${error.message}`);
  if (!data) return <EnlaceInvalido />;

  const estado = estadoDeCita(data, new Date());
  const acento = /^#[0-9A-Fa-f]{6}$/.test(data.color_acento ?? "")
    ? data.color_acento!
    : COLOR_POR_DEFECTO;
  const duracion = Math.round((Date.parse(data.fin) - Date.parse(data.inicio)) / 60_000);

  return (
    <section
      className="flex flex-col gap-5 rounded-[14px] border border-borde bg-superficie p-6"
      style={{ "--acento": acento } as React.CSSProperties}
    >
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {estado === "vigente" ? "¿Cancelar tu cita?" : "Tu cita"}
      </h1>

      <div className={estado === "cancelada" ? "text-tinta-suave" : undefined}>
        <p className={`text-lg font-semibold ${estado === "cancelada" ? "line-through" : ""}`}>
          {fechaDeCita(data.inicio, data.zona_horaria)}
        </p>
        <p className="text-tinta-suave">
          {data.servicio_nombre} · {duracion} min · {data.negocio_nombre}
        </p>
        {data.direccion && <p className="text-tinta-suave">{data.direccion}</p>}
        <p className="text-sm text-tinta-suave">A nombre de {data.nombre_cliente}</p>
      </div>

      {estado === "vigente" && <FormularioCancelar token={token} slug={data.negocio_slug} />}

      {estado === "cancelada" && (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">Esta cita ya está cancelada.</p>
          <a href={`/${data.negocio_slug}`} className="font-medium text-[var(--acento)]">
            Reservar otra cita
          </a>
        </div>
      )}

      {estado === "pasada" && (
        <p className="font-semibold">Esta cita ya pasó, así que no se puede cancelar.</p>
      )}

      {data.telefono_publico && (
        <p className="text-sm text-tinta-suave">
          ¿Dudas? Llama a {data.negocio_nombre} al {data.telefono_publico}.
        </p>
      )}
    </section>
  );
}

// Mismo mensaje para un enlace mal copiado y para uno que no existe: no se da
// ninguna pista sobre qué tokens hay.
function EnlaceInvalido() {
  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-borde bg-superficie p-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">No encontramos tu cita</h1>
      <p className="text-tinta-suave">
        Revisa que el enlace esté completo; a veces el correo lo parte en dos líneas. Si sigue sin
        funcionar, comunícate con el negocio.
      </p>
    </section>
  );
}
