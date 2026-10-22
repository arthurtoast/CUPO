import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { MensajeError } from "@/components/formulario";
import { enlacePublico, enlaceVisible, origenDesdeHeaders } from "@/lib/enlace";
import { agruparPorDia, claveDia, etiquetaDia, formatearHora } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";
import { BotonCopiar } from "./boton-copiar";

export const metadata: Metadata = { title: "Agenda · Cupo" };

type Cita = {
  id: string;
  inicio: string;
  fin: string;
  nombre_cliente: string;
  correo_cliente: string;
  telefono_cliente: string;
  estado: "confirmada" | "cancelada";
  servicio: { nombre: string } | null;
};

// El teléfono se guarda solo con dígitos; los de 10 se leen como 81 1234 5678.
function formatearTelefono(telefono: string) {
  return telefono.length === 10
    ? `${telefono.slice(0, 2)} ${telefono.slice(2, 6)} ${telefono.slice(6)}`
    : telefono;
}

function TarjetaCita({ cita, zona }: { cita: Cita; zona: string }) {
  const inicio = new Date(cita.inicio);
  const fin = new Date(cita.fin);
  const duracion = Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  const cancelada = cita.estado === "cancelada";

  return (
    <li
      className={`flex flex-col gap-3 rounded-[10px] border border-[#efede6] p-4 sm:flex-row sm:items-start sm:gap-5 ${
        cancelada ? "bg-[#f1efe7] text-tinta-suave opacity-70" : "bg-[#f7f6f2]"
      }`}
    >
      <p className="shrink-0 text-[15px] font-semibold tabular-nums sm:w-[120px]">
        {formatearHora(inicio, zona)}–{formatearHora(fin, zona)}
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className={`text-[15px] font-semibold ${cancelada ? "line-through" : ""}`}>
            {cita.nombre_cliente}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              cancelada ? "bg-borde text-tinta-suave" : "bg-[#e6f2ec] text-exito"
            }`}
          >
            {cancelada ? "Cancelada" : "Confirmada"}
          </span>
        </div>
        <span className="text-[13px] text-tinta-suave">
          {cita.servicio?.nombre ?? "Servicio"} · {duracion} min
        </span>
        <div className="flex flex-wrap gap-x-5 text-[13px]">
          <a
            href={`tel:${cita.telefono_cliente}`}
            className="flex min-h-11 items-center text-tinta-suave underline-offset-2 hover:underline sm:min-h-0"
          >
            {formatearTelefono(cita.telefono_cliente)}
          </a>
          <a
            href={`mailto:${cita.correo_cliente}`}
            className="flex min-h-11 items-center break-all text-tinta-suave underline-offset-2 hover:underline sm:min-h-0"
          >
            {cita.correo_cliente}
          </a>
        </div>
      </div>
    </li>
  );
}

// Se lee en cada request (connection) para que una reserva nueva aparezca al
// recargar. RLS limita las citas a negocio_id = auth.uid().
async function ListaCitas() {
  await connection();
  const supabase = await createClient();

  // Margen de dos días hacia atrás: el inicio de "hoy" depende de la zona del
  // negocio, así que el corte exacto se hace abajo con la clave del día local.
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000);

  const [negocio, citas] = await Promise.all([
    supabase.from("negocio").select("zona_horaria").maybeSingle(),
    supabase
      .from("cita")
      .select(
        "id, inicio, fin, nombre_cliente, correo_cliente, telefono_cliente, estado, servicio(nombre)",
      )
      .gte("inicio", desde.toISOString())
      .order("inicio"),
  ]);

  if (negocio.error || citas.error) {
    return (
      <MensajeError mensaje="No pudimos cargar tu agenda. Recarga la página para intentar de nuevo." />
    );
  }

  const zona = negocio.data?.zona_horaria ?? "America/Monterrey";
  const hoy = claveDia(ahora, zona);
  const dias = agruparPorDia(citas.data as unknown as Cita[], zona).filter(
    ({ clave }) => clave >= hoy,
  );

  if (dias.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[14px] border border-borde bg-superficie p-6">
        <h2 className="font-display text-base font-bold">No tienes citas próximas</h2>
        <p className="text-sm text-tinta-suave">
          Cuando un cliente reserve desde tu página, su cita aparecerá aquí.
        </p>
        <Link
          href="/panel/disponibilidad"
          className="flex min-h-11 items-center text-sm font-semibold text-[var(--acento)] underline-offset-2 hover:underline"
        >
          Revisa tu disponibilidad
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {dias.map(({ clave, items }) => {
        const confirmadas = items.filter((c) => c.estado === "confirmada").length;
        return (
          <section
            key={clave}
            aria-labelledby={`dia-${clave}`}
            className="flex flex-col gap-3 rounded-[14px] border border-borde bg-superficie p-4 sm:p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id={`dia-${clave}`}
                className={`font-display text-base font-bold ${
                  clave === hoy ? "text-[var(--acento)]" : ""
                }`}
              >
                {etiquetaDia(clave, hoy)}
              </h2>
              <span className="text-[13px] text-tinta-suave">
                {confirmadas} {confirmadas === 1 ? "cita" : "citas"}
              </span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {items.map((cita) => (
                <TarjetaCita key={cita.id} cita={cita} zona={zona} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// El origen sale de los headers del request para que el enlace sirva igual en
// local (localhost:3000) que en producción.
async function EnlacePublico() {
  const [encabezados, supabase] = await Promise.all([headers(), createClient()]);
  const { data } = await supabase.auth.getClaims();
  const { data: negocio } = await supabase
    .from("negocio")
    .select("slug")
    .eq("id", data?.claims?.sub ?? "")
    .maybeSingle();

  if (!negocio?.slug) return null;

  const enlace = enlacePublico(origenDesdeHeaders(encabezados), negocio.slug);

  return (
    <section
      aria-labelledby="enlace-publico"
      className="flex flex-col gap-3 rounded-[14px] border border-borde bg-superficie p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="enlace-publico" className="font-display text-base font-bold">
          Tu enlace público
        </h2>
        <p className="break-all text-[15px] font-medium">{enlaceVisible(enlace)}</p>
        <p className="text-[13px] text-tinta-suave">
          Compártelo por WhatsApp o Instagram para que tus clientes reserven.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
        <BotonCopiar texto={enlace} />
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center text-sm font-semibold text-[var(--acento)] underline-offset-2 hover:underline"
        >
          Ver mi página
        </a>
      </div>
    </section>
  );
}

export default function Panel() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Agenda</h1>
        <p className="text-[15px] text-tinta-suave">Tus citas de hoy en adelante.</p>
      </div>
      <Suspense fallback={null}>
        <EnlacePublico />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando tu agenda…</p>}>
        <ListaCitas />
      </Suspense>
    </>
  );
}
