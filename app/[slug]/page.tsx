import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { calcularDias } from "@/lib/huecos";
import { leerDatosReserva, leerMarca } from "./datos";
import { Reservador } from "./reservador";

// Cuántos días se ofrecen a partir de hoy. Se puede cambiar con la variable de
// entorno CUPO_DIAS_VISIBLES (1 a 60).
const DIAS_VISIBLES = rango(Number(process.env.CUPO_DIAS_VISIBLES ?? 14), 1, 60, 14);

const COLOR_POR_DEFECTO = "#2B5CE6";

function rango(n: number, min: number, max: number, porDefecto: number) {
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const marca = await leerMarca(slug);
  if (!marca) return { title: "Cupo" };
  return {
    title: `Reserva en ${marca.nombre} · Cupo`,
    description: marca.descripcion ?? `Elige día y hora para tu cita en ${marca.nombre}.`,
  };
}

// HU-09: página pública del negocio, sin sesión. El slug y la disponibilidad
// son datos de la petición, por eso todo va dentro de <Suspense>.
export default function PaginaReserva({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Reserva params={params} />
    </Suspense>
  );
}

async function Reserva({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  // La disponibilidad depende de la hora actual: nunca se prerenderiza.
  await connection();

  const marca = await leerMarca(slug);
  if (!marca) notFound();

  const ahora = new Date();
  // Un día de margen por la diferencia entre UTC y la zona del negocio.
  const hasta = new Date(ahora.getTime() + (DIAS_VISIBLES + 1) * 86_400_000);
  const { servicio, horario, ocupados } = await leerDatosReserva(marca.id, hasta);

  const acento = /^#[0-9A-Fa-f]{6}$/.test(marca.color_acento ?? "")
    ? marca.color_acento!
    : COLOR_POR_DEFECTO;

  const dias =
    servicio && horario.length > 0
      ? calcularDias({
          horario,
          ocupados,
          duracionMin: servicio.duracion_min,
          zonaHoraria: marca.zona_horaria,
          ahora,
          dias: DIAS_VISIBLES,
        })
      : [];

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ "--acento": acento } as React.CSSProperties}
    >
      <Reservador
        slug={marca.slug}
        marca={{
          nombre: marca.nombre,
          descripcion: marca.descripcion,
          logoUrl: marca.logo_url,
          telefono: marca.telefono_publico,
          direccion: marca.direccion,
        }}
        servicio={servicio}
        zonaHoraria={marca.zona_horaria}
        dias={dias}
      />
    </div>
  );
}

function Cargando() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col" aria-busy="true">
      <div className="h-[132px] border-b border-borde bg-superficie" />
      <p className="px-5 py-6 text-sm text-tinta-suave">Cargando horarios…</p>
    </main>
  );
}
