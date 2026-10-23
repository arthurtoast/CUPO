"use client";

import { useActionState, useState } from "react";
import { BotonCopiar } from "@/app/panel/boton-copiar";
import { Campo, MensajeError } from "@/components/formulario";
import type { Dia, Hueco } from "@/lib/huecos";
import { ERRORES_DE_HORARIO, NOMBRE_MAX } from "@/lib/reserva";
import { reservar, type EstadoReserva } from "./actions";

type Props = {
  slug: string;
  marca: {
    nombre: string;
    descripcion: string | null;
    logoUrl: string | null;
    telefono: string | null;
    direccion: string | null;
  };
  servicio: { id: string; nombre: string; duracion_min: number } | null;
  zonaHoraria: string;
  dias: Dia[];
};

const estadoInicial: EstadoReserva = { tipo: "inicial" };

// ---------------------------------------------------------------------------
// Formatos de fecha (español de México, sin depender de la zona del navegador)
// ---------------------------------------------------------------------------

// Las fechas "YYYY-MM-DD" se formatean al mediodía UTC con zona UTC: así el día
// nunca se recorre, esté donde esté el visitante.
function formatoFecha(fecha: string, opciones: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-MX", { ...opciones, timeZone: "UTC" })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(/\./g, "");
}

const diaCorto = (fecha: string) => formatoFecha(fecha, { weekday: "short" });
const diaLargo = (fecha: string) => formatoFecha(fecha, { weekday: "long" });
const numeroDia = (fecha: string) => Number(fecha.slice(8, 10));
const mes = (fecha: string) => formatoFecha(fecha, { month: "long" });

function formatoCita(inicio: string, zona: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(inicio));
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]!.toUpperCase())
    .join("");
}

const libres = (dia: Dia) => dia.huecos.filter((h) => h.libre).length;

// ---------------------------------------------------------------------------

export function Reservador({ slug, marca, servicio, zonaHoraria, dias }: Props) {
  const [estado, accion, enviando] = useActionState(reservar, estadoInicial);
  const [fechaElegida, setFechaElegida] = useState<string | null>(null);
  const [inicioElegido, setInicioElegido] = useState<string | null>(null);
  const [datos, setDatos] = useState({ nombre: "", correo: "", telefono: "" });
  const [ocultarError, setOcultarError] = useState(false);

  // Cuando llega una respuesta nueva del servidor: si rechazó el horario, se
  // quita la selección; y el mensaje de error vuelve a mostrarse. Es el patrón
  // de React para ajustar estado cuando cambia un valor, sin efectos.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    setOcultarError(false);
    if (estado.tipo === "error" && estado.inicioRechazado) setInicioElegido(null);
  }

  const encabezado = <Encabezado marca={marca} servicio={servicio} />;

  if (estado.tipo === "reservada") {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <Encabezado marca={marca} servicio={servicio} sinInstruccion />
        <Confirmacion
          inicio={estado.inicio}
          zonaHoraria={zonaHoraria}
          duracion={servicio?.duracion_min}
          nombre={marca.nombre}
          telefono={marca.telefono}
          direccion={marca.direccion}
          slug={slug}
          enlaceCancelar={estado.enlaceCancelar}
          correoEnviadoA={estado.correoEnviadoA}
        />
      </main>
    );
  }

  if (!servicio || dias.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        {encabezado}
        <Aviso>
          {marca.nombre} todavía no publica sus horarios.
          {marca.telefono ? ` Puedes llamar al ${marca.telefono}.` : ""}
        </Aviso>
      </main>
    );
  }

  // El día y el hueco se derivan de lo elegido: si tras recargar ya no tienen
  // lugar libre, se cae al primer día con lugar y a ningún hueco.
  const primerDiaConLugar = dias.find((d) => libres(d) > 0);
  const dia =
    dias.find((d) => d.fecha === fechaElegida && libres(d) > 0) ?? primerDiaConLugar;
  const hueco: Hueco | undefined = dia?.huecos.find(
    (h) => h.inicio === inicioElegido && h.libre,
  );

  const error = estado.tipo === "error" && !ocultarError ? estado : null;
  const errorDeHorario = error?.codigo && ERRORES_DE_HORARIO.has(error.codigo) ? error : null;
  const errorDelFormulario = error && !errorDeHorario ? error : null;
  const errorCampo = errorDelFormulario?.errores ?? {};

  function elegirDia(fecha: string) {
    setFechaElegida(fecha);
    setInicioElegido(null);
    setOcultarError(true);
  }

  function elegirHueco(inicio: string) {
    setInicioElegido(inicio);
    setOcultarError(true);
  }

  function cambiar(campo: keyof typeof datos) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setDatos((d) => ({ ...d, [campo]: e.target.value }));
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
      {encabezado}

      <form action={accion} className="flex flex-1 flex-col">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="servicio_id" value={servicio.id} />
        <input type="hidden" name="inicio" value={hueco?.inicio ?? ""} />

        <div className="flex flex-1 flex-col gap-7 px-5 py-6">
          {!dia ? (
            <Aviso>
              No hay horarios libres en los próximos {dias.length} días.
              {marca.telefono ? ` Puedes llamar al ${marca.telefono}.` : ""}
            </Aviso>
          ) : (
            <>
              <section aria-labelledby="titulo-dias">
                <h2 id="titulo-dias" className="mb-3 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
                  {mes(dia.fecha)}
                </h2>
                <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Día">
                  {dias.map((d) => {
                    const hayLugar = libres(d) > 0;
                    const elegido = d.fecha === dia.fecha;
                    return (
                      <button
                        key={d.fecha}
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        aria-label={`${diaLargo(d.fecha)} ${numeroDia(d.fecha)}${hayLugar ? "" : ", sin horarios libres"}`}
                        disabled={!hayLugar}
                        onClick={() => elegirDia(d.fecha)}
                        className={`flex min-h-16 w-[68px] shrink-0 flex-col items-center justify-center rounded-[12px] border text-center ${
                          elegido
                            ? "border-[var(--acento)] bg-[var(--acento)] text-white"
                            : hayLugar
                              ? "border-borde-control bg-superficie"
                              : "border-borde bg-borde/50 text-tinta-suave/60"
                        }`}
                      >
                        <span className={`text-xs ${elegido ? "text-white/85" : "text-tinta-suave"}`}>
                          {diaCorto(d.fecha)}
                        </span>
                        <span className="font-display text-xl font-bold">{numeroDia(d.fecha)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="titulo-horas">
                <h2 id="titulo-horas" className="mb-3 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
                  {diaLargo(dia.fecha)} {numeroDia(dia.fecha)} · {libres(dia)}{" "}
                  {libres(dia) === 1 ? "horario libre" : "horarios libres"}
                </h2>
                {errorDeHorario && (
                  <div className="mb-3">
                    <MensajeError mensaje={errorDeHorario.mensaje} />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Hora">
                  {/* Los que ya pasaron no se muestran; los ocupados sí, tachados. */}
                  {dia.huecos.filter((h) => !h.pasado).map((h) => {
                    const elegido = h.inicio === hueco?.inicio;
                    return (
                      <button
                        key={h.inicio}
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        aria-label={h.libre ? h.hora : `${h.hora}, no disponible`}
                        disabled={!h.libre}
                        onClick={() => elegirHueco(h.inicio)}
                        className={`min-h-12 rounded-[10px] border text-base font-medium tabular-nums ${
                          elegido
                            ? "border-[var(--acento)] bg-[var(--acento)] font-semibold text-white"
                            : h.libre
                              ? "border-borde-control bg-superficie"
                              : "border-borde bg-borde/50 text-tinta-suave/60 line-through"
                        }`}
                      >
                        {h.hora}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="titulo-datos" className="flex flex-col gap-4">
                <h2 id="titulo-datos" className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
                  Tus datos
                </h2>
                {errorDelFormulario && <MensajeError mensaje={errorDelFormulario.mensaje} />}
                <ConError mensaje={errorCampo.nombre} id="error-nombre">
                  <Campo
                    etiqueta="Nombre"
                    name="nombre"
                    required
                    maxLength={NOMBRE_MAX}
                    autoComplete="name"
                    placeholder="Como quieres que te llamemos"
                    value={datos.nombre}
                    onChange={cambiar("nombre")}
                    aria-invalid={!!errorCampo.nombre}
                    aria-describedby={errorCampo.nombre ? "error-nombre" : undefined}
                  />
                </ConError>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ConError mensaje={errorCampo.correo} id="error-correo">
                    <Campo
                      etiqueta="Correo"
                      name="correo"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="para tu confirmación"
                      value={datos.correo}
                      onChange={cambiar("correo")}
                      aria-invalid={!!errorCampo.correo}
                      aria-describedby={errorCampo.correo ? "error-correo" : undefined}
                    />
                  </ConError>
                  <ConError mensaje={errorCampo.telefono} id="error-telefono">
                    <Campo
                      etiqueta="Teléfono"
                      name="telefono"
                      type="tel"
                      required
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="10 dígitos"
                      value={datos.telefono}
                      onChange={cambiar("telefono")}
                      aria-invalid={!!errorCampo.telefono}
                      aria-describedby={errorCampo.telefono ? "error-telefono" : undefined}
                    />
                  </ConError>
                </div>
              </section>
            </>
          )}
        </div>

        {dia && (
          <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-borde bg-superficie px-5 py-4">
            <div className="min-w-0" aria-live="polite">
              {hueco ? (
                <>
                  <p className="font-semibold">
                    {diaCorto(dia.fecha)} {numeroDia(dia.fecha)} · {hueco.hora}
                  </p>
                  <p className="text-sm text-tinta-suave">{servicio.duracion_min} min</p>
                </>
              ) : (
                <p className="text-sm text-tinta-suave">Elige una hora</p>
              )}
            </div>
            <button
              type="submit"
              disabled={!hueco || enviando}
              className="min-h-12 shrink-0 rounded-[12px] bg-[var(--acento)] px-6 font-semibold text-white disabled:opacity-50"
            >
              {enviando ? "Confirmando…" : "Confirmar cita"}
            </button>
          </div>
        )}
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Encabezado({
  marca,
  servicio,
  sinInstruccion = false,
}: Pick<Props, "marca" | "servicio"> & { sinInstruccion?: boolean }) {
  return (
    <header className="border-b border-borde bg-superficie px-5 py-5">
      <div className="flex items-center gap-4">
        {marca.logoUrl ? (
          // El logo viene de cualquier dominio que configure el negocio; next/image
          // pediría declarar cada dominio en next.config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={marca.logoUrl}
            alt=""
            className="size-14 shrink-0 rounded-[12px] border border-borde object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-[12px] bg-borde font-display text-lg font-bold text-tinta-suave"
          >
            {iniciales(marca.nombre)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight">{marca.nombre}</h1>
          {servicio && (
            <p className="text-sm text-tinta-suave">
              {servicio.nombre} · {servicio.duracion_min} min
            </p>
          )}
        </div>
      </div>
      {marca.descripcion && <p className="mt-3 text-tinta-suave">{marca.descripcion}</p>}
      {!sinInstruccion && (
        <p className="mt-3">Elige el día y la hora que te acomode. No necesitas cuenta.</p>
      )}
    </header>
  );
}

function ConError({
  mensaje,
  id,
  children,
}: {
  mensaje?: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {children}
      {mensaje && (
        <p id={id} className="text-sm text-error">
          {mensaje}
        </p>
      )}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <section className="m-5 rounded-[14px] border border-borde bg-superficie p-6 text-tinta-suave">
      {children}
    </section>
  );
}

function Confirmacion({
  inicio,
  zonaHoraria,
  duracion,
  nombre,
  telefono,
  direccion,
  slug,
  enlaceCancelar,
  correoEnviadoA,
}: {
  inicio: string;
  zonaHoraria: string;
  duracion?: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  slug: string;
  enlaceCancelar: string;
  correoEnviadoA: string | null;
}) {
  return (
    <section
      role="status"
      className="m-5 flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-6"
    >
      <h2 className="font-display text-2xl font-bold tracking-tight">Tu cita quedó apartada</h2>
      <div>
        <p className="text-lg font-semibold first-letter:uppercase">
          {formatoCita(inicio, zonaHoraria)}
        </p>
        <p className="text-tinta-suave">
          {nombre}
          {duracion ? ` · ${duracion} min` : ""}
        </p>
        {direccion && <p className="text-tinta-suave">{direccion}</p>}
      </div>
      {correoEnviadoA && (
        <p className="text-sm">
          Te enviamos la confirmación a <span className="font-medium">{correoEnviadoA}</span>.
        </p>
      )}
      {/* HU-12: el enlace también va aquí, por si el correo no llega. */}
      <div className="flex flex-col gap-2 rounded-[10px] border border-borde bg-fondo p-4">
        <p className="text-sm font-medium">Enlace para cancelar tu cita</p>
        <p className="break-all text-sm text-tinta-suave">{enlaceCancelar}</p>
        <div>
          <BotonCopiar texto={enlaceCancelar} />
        </div>
        <p className="text-xs text-tinta-suave">
          Guárdalo. Cualquiera con este enlace puede cancelar la cita: no lo compartas.
        </p>
      </div>
      {telefono && (
        <p className="text-sm text-tinta-suave">Si necesitas cambiarla, llama al {telefono}.</p>
      )}
      {/* Recarga completa: limpia el formulario y trae los horarios al día. */}
      <a href={`/${slug}`} className="font-medium text-[var(--acento)]">
        Reservar otra cita
      </a>
    </section>
  );
}
