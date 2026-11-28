import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { calcularDias } from "@/lib/huecos";
import { COLOR_POR_DEFECTO, esColorValido } from "@/lib/marca";
import { elegirStaff, ocupadosPara } from "@/lib/staff";
import { ChatReserva } from "./chat-reserva";                                     // aporta: HU-17, chat que agenda
import { leerDatosReserva, leerMarca } from "./datos";
import { Reservador } from "./reservador";

// Cuántos días se ofrecen a partir de hoy. Se puede cambiar con la variable de
// entorno CUPO_DIAS_VISIBLES (1 a 60).
const DIAS_VISIBLES = rango(Number(process.env.CUPO_DIAS_VISIBLES ?? 14), 1, 60, 14);

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
export default function PaginaReserva({ params, searchParams }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Reserva params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Reserva({
  params,
  searchParams,
}: {
  params: PageProps<"/[slug]">["params"];
  searchParams: PageProps<"/[slug]">["searchParams"];
}) {
  const { slug } = await params;
  // HU-18: ?con=<id> dice con quién del staff; si falta, la primera persona.
  const { con } = await searchParams;
  // La disponibilidad depende de la hora actual: nunca se prerenderiza.
  await connection();

  const marca = await leerMarca(slug);
  if (!marca) notFound();

  const ahora = new Date();
  // Un día de margen por la diferencia entre UTC y la zona del negocio.
  const hasta = new Date(ahora.getTime() + (DIAS_VISIBLES + 1) * 86_400_000);
  const { servicio, horario, ocupados, staff } = await leerDatosReserva(marca.id, hasta);
  const elegido = elegirStaff(staff, con);

  // HU-06: el color del negocio pinta botones y selección de día y hora.
  const acento = esColorValido(marca.color_acento) ? marca.color_acento : COLOR_POR_DEFECTO;

  // Días de una persona (o del carril sin staff). HU-17: el chat necesita los
  // de todas las personas para que el cliente elija con quién dentro del chat.
  const diasDe = (staffId: string | null) =>                                      // aporta: mismo cálculo para página y chat
    servicio && horario.length > 0
      ? calcularDias({
          horario,
          ocupados: ocupadosPara(ocupados, staffId),
          duracionMin: servicio.duracion_min,
          zonaHoraria: marca.zona_horaria,
          ahora,
          dias: DIAS_VISIBLES,
        })
      : [];
  const opciones = staff.length > 0                                               // aporta: una opción por persona, o una sin staff
    ? staff.map((m) => ({ staff: m, dias: diasDe(m.id) }))
    : [{ staff: null, dias: diasDe(null) }];
  const dias = opciones.find((o) => (o.staff?.id ?? null) === (elegido?.id ?? null))?.dias ?? []; // aporta: los de la persona elegida en la página

  return (
    <div
      className="flex flex-1 flex-col selection:bg-[var(--acento)] selection:text-white"
      style={{ "--acento": acento } as React.CSSProperties}
    >
      <Reservador
        // Al cambiar de persona se empieza de cero (día y hora elegidos).
        key={elegido?.id ?? "sin-staff"}
        slug={marca.slug}
        staff={staff}
        elegido={elegido}
        marca={{
          nombre: marca.nombre,
          descripcion: marca.descripcion,
          logoUrl: marca.logo_url,
          telefono: marca.telefono_publico,
          direccion: marca.direccion,
          portadaUrl: marca.portada_url,
          bienvenida: marca.bienvenida,
          instagram: marca.instagram,
          facebook: marca.facebook,
          whatsapp: marca.whatsapp,
        }}
        servicio={servicio}
        zonaHoraria={marca.zona_horaria}
        dias={dias}
        chat={servicio && (
          <ChatReserva                                                              // aporta: HU-17; usa los días de todas las personas
            slug={marca.slug}
            servicioId={servicio.id}
            contexto={{
              negocio: marca.nombre,
              telefono: marca.telefono_publico,
              direccion: marca.direccion,
              servicio: { nombre: servicio.nombre, duracion_min: servicio.duracion_min },
              opciones,
            }}
          />
        )}
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
