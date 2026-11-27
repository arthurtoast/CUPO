import Link from "next/link";
import { connection } from "next/server";
import { MensajeError } from "@/components/formulario";
import { fechaLocal, sumarDias } from "@/lib/huecos";
import { formatearHora } from "@/lib/fechas";
import {
  acomodarCitas,
  diasDeLaSemana,
  etiquetaSemana,
  limitesSemana,
  lunesDe,
  rangoHoras,
} from "@/lib/semana";
import { createClient } from "@/lib/supabase/server";

// HU-19 · Vista semanal de la agenda. Cada hora mide lo mismo, así que la
// altura de una cita es proporcional a su duración.
const ALTO_HORA = 56; // px

type Cita = {
  id: string;
  inicio: string;
  fin: string;
  nombre_cliente: string;
  estado: "confirmada" | "cancelada";
  servicio: { nombre: string } | null;
  staff: { nombre: string } | null; // HU-18: con quién es la cita
};

const NOMBRES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export async function AgendaSemanal({ semana }: { semana?: string }) {
  await connection();
  const supabase = await createClient();

  const { data: negocio, error: errorNegocio } = await supabase
    .from("negocio")
    .select("zona_horaria")
    .maybeSingle();
  if (errorNegocio) {
    return <MensajeError mensaje="No pudimos cargar tu agenda. Recarga la página para intentar de nuevo." />;
  }

  const zona = negocio?.zona_horaria ?? "America/Monterrey";
  const hoy = fechaLocal(new Date(), zona);
  const lunes = lunesDe(semana ?? hoy);
  const { desde, hasta } = limitesSemana(lunes, zona);

  const [citas, horario] = await Promise.all([
    supabase
      .from("cita")
      .select("id, inicio, fin, nombre_cliente, estado, servicio(nombre), staff:staff!cita_staff_del_negocio(nombre)")
      .gte("inicio", desde.toISOString())
      .lt("inicio", hasta.toISOString())
      .order("inicio"),
    supabase.from("horario_atencion").select("hora_inicio, hora_fin"),
  ]);

  if (citas.error || horario.error) {
    return <MensajeError mensaje="No pudimos cargar tu agenda. Recarga la página para intentar de nuevo." />;
  }

  const posiciones = acomodarCitas(citas.data as unknown as Cita[], lunes, zona);
  const { desdeHora, hastaHora } = rangoHoras(posiciones, horario.data ?? []);
  const horas = Array.from({ length: hastaHora - desdeHora }, (_, i) => desdeHora + i);
  const dias = diasDeLaSemana(lunes);
  const confirmadas = posiciones.filter((p) => p.cita.estado === "confirmada").length;
  const enlace = (clave: string) => `/panel?vista=semana&semana=${clave}`;

  return (
    <section
      aria-labelledby="titulo-semana"
      className="flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="titulo-semana" className="font-display text-base font-bold">
            {etiquetaSemana(lunes)}
          </h2>
          <span className="text-[13px] text-tinta-suave">
            {confirmadas} {confirmadas === 1 ? "cita confirmada" : "citas confirmadas"}
          </span>
        </div>
        <nav aria-label="Cambiar de semana" className="flex items-center gap-1">
          <Link
            href={enlace(sumarDias(lunes, -7))}
            aria-label="Semana anterior"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[9px] border border-borde text-lg hover:bg-[#f7f6f2]"
          >
            ‹
          </Link>
          <Link
            href={enlace(lunesDe(hoy))}
            className="flex min-h-11 items-center rounded-[9px] border border-borde px-3 text-sm font-medium hover:bg-[#f7f6f2]"
          >
            Hoy
          </Link>
          <Link
            href={enlace(sumarDias(lunes, 7))}
            aria-label="Semana siguiente"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[9px] border border-borde text-lg hover:bg-[#f7f6f2]"
          >
            ›
          </Link>
        </nav>
      </div>

      {/* En el celular la semana se desliza de lado para que las citas no se encimen. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="grid min-w-[720px] grid-cols-[44px_repeat(7,minmax(0,1fr))]">
          <div />
          {dias.map((clave, i) => (
            <div
              key={clave}
              className={`border-b border-borde pb-2 text-center text-[13px] ${
                clave === hoy ? "font-semibold text-[var(--acento)]" : "text-tinta-suave"
              }`}
            >
              {NOMBRES[i]} <span className="tabular-nums">{Number(clave.slice(8, 10))}</span>
            </div>
          ))}

          <div className="relative" style={{ height: horas.length * ALTO_HORA }}>
            {horas.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-tinta-suave"
                style={{ top: i * ALTO_HORA }}
              >
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>

          {dias.map((clave, d) => (
            <div
              key={clave}
              data-dia={clave}
              className={`relative border-l border-borde ${clave === hoy ? "bg-[#f7f6f2]" : ""}`}
              style={{
                height: horas.length * ALTO_HORA,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ALTO_HORA - 1}px, #efede6 ${ALTO_HORA - 1}px, #efede6 ${ALTO_HORA}px)`,
              }}
            >
              {posiciones
                .filter((p) => p.dia === d)
                .map((p) => {
                  const cancelada = p.cita.estado === "cancelada";
                  const top = ((p.desdeMin - desdeHora * 60) / 60) * ALTO_HORA;
                  const alto = Math.max(((p.hastaMin - p.desdeMin) / 60) * ALTO_HORA - 2, 20);
                  const ancho = 100 / p.columnas;
                  const hora = `${formatearHora(new Date(p.cita.inicio), zona)}–${formatearHora(new Date(p.cita.fin), zona)}`;
                  return (
                    <div
                      key={p.cita.id}
                      title={`${hora} · ${p.cita.nombre_cliente} · ${p.cita.servicio?.nombre ?? "Servicio"}${p.cita.staff ? ` · con ${p.cita.staff.nombre}` : ""}${cancelada ? " · Cancelada" : ""}`}
                      className={`absolute overflow-hidden rounded-[7px] border-l-[3px] px-1.5 py-1 text-[11px] leading-tight ${
                        cancelada
                          ? "border-borde bg-[#f1efe7] text-tinta-suave line-through opacity-70"
                          : "border-[var(--acento)] bg-[color-mix(in_srgb,var(--acento)_14%,white)]"
                      }`}
                      style={{
                        top: top + 1,
                        height: alto,
                        left: `calc(${p.columna * ancho}% + 2px)`,
                        width: `calc(${ancho}% - 4px)`,
                      }}
                    >
                      <p className="font-semibold tabular-nums">{formatearHora(new Date(p.cita.inicio), zona)}</p>
                      <p className="truncate">{p.cita.nombre_cliente}</p>
                      {alto > 44 && (
                        <p className="truncate text-tinta-suave">
                          {p.cita.staff ? `con ${p.cita.staff.nombre}` : (p.cita.servicio?.nombre ?? "Servicio")}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
