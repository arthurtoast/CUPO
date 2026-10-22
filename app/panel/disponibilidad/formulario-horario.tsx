"use client";

import { startTransition, useActionState, useState } from "react";
import { MensajeError, MensajeGuardado } from "@/components/formulario";
import { NOMBRES_DIA, validarHorario, type Bloque, type Dia } from "@/lib/horario";
import { guardarHorario, type EstadoHorario } from "./actions-horario";

const estadoInicial: EstadoHorario = {};
const MAX_BLOQUES = 3;

const claseHora =
  "min-h-11 w-[104px] rounded-[8px] border border-borde-control bg-superficie px-3 text-sm outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento)]/20";

export function FormularioHorario({
  inicial,
  zonaHoraria,
}: {
  inicial: Dia[];
  zonaHoraria: string;
}) {
  const [dias, setDias] = useState(inicial);
  const [editado, setEditado] = useState(false);
  const [revisado, setRevisado] = useState<Record<number, string> | null>(null);
  const [estado, accion, pendiente] = useActionState(guardarHorario, estadoInicial);

  // Los errores por día se muestran después del primer intento de guardar y se
  // recalculan mientras el negocio corrige.
  const errores = revisado ? validarHorario(dias) : (estado.errores ?? {});

  function cambiar(nuevos: Dia[]) {
    setDias(nuevos);
    setEditado(true);
  }

  function cambiarDia(i: number, cambio: Partial<Dia>) {
    cambiar(dias.map((dia, j) => (j === i ? { ...dia, ...cambio } : dia)));
  }

  function cambiarBloque(i: number, k: number, cambio: Partial<Bloque>) {
    const bloques = dias[i]!.bloques.map((b, j) => (j === k ? { ...b, ...cambio } : b));
    cambiarDia(i, { bloques });
  }

  function agregarBloque(i: number) {
    const bloques = dias[i]!.bloques;
    const ultimo = bloques.at(-1);
    // El segundo bloque suele ser la tarde después de la comida.
    const nuevo = ultimo
      ? { inicio: ultimo.fin, fin: ultimo.fin < "19:00" ? "19:00" : "23:59" }
      : { inicio: "09:00", fin: "19:00" };
    cambiarDia(i, { bloques: [...bloques, nuevo] });
  }

  function quitarBloque(i: number, k: number) {
    cambiarDia(i, { bloques: dias[i]!.bloques.filter((_, j) => j !== k) });
  }

  // HU-03: replica el horario del lunes en los días marcados como abiertos.
  function copiarATodos() {
    const lunes = dias[0]!.bloques;
    cambiar(
      dias.map((dia, i) =>
        i > 0 && dia.abierto ? { ...dia, bloques: lunes.map((b) => ({ ...b })) } : dia,
      ),
    );
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const encontrados = validarHorario(dias);
    setRevisado(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setRevisado(null);
    setEditado(false);
    startTransition(() => accion(dias));
  }

  const hayErroresLocales = revisado !== null && Object.keys(errores).length > 0;
  const mensaje = hayErroresLocales ? "Revisa los días marcados antes de guardar." : estado.error;

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="flex flex-col gap-1 rounded-[14px] border border-borde bg-superficie p-5 sm:px-[26px] sm:py-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borde pb-3.5">
        <h2 className="font-display text-[17px] font-bold">Horario de atención</h2>
        <span className="text-[13px] text-tinta-suave">Zona horaria: {zonaHoraria}</span>
      </div>

      <ul className="flex flex-col">
        {dias.map((dia, i) => {
          const nombre = NOMBRES_DIA[i]!;
          const minuscula = nombre.toLowerCase();
          return (
            <li key={nombre} className="flex flex-col gap-2 border-b border-borde/60 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <label
                  className={`flex min-h-11 w-[132px] items-center gap-2.5 text-[15px] font-medium ${dia.abierto ? "" : "text-tinta-suave"}`}
                >
                  <input
                    type="checkbox"
                    checked={dia.abierto}
                    onChange={(e) => cambiarDia(i, { abierto: e.target.checked })}
                    className="size-[17px] accent-[var(--acento)]"
                  />
                  {nombre}
                </label>

                {dia.abierto ? (
                  <div className="flex flex-col gap-2">
                    {dia.bloques.map((bloque, k) => (
                      <div key={k} className="flex items-center gap-2 sm:gap-3">
                        <input
                          type="time"
                          value={bloque.inicio}
                          onChange={(e) => cambiarBloque(i, k, { inicio: e.target.value })}
                          aria-label={`Hora de inicio del ${minuscula}${k > 0 ? `, bloque ${k + 1}` : ""}`}
                          className={claseHora}
                        />
                        <span className="text-sm text-tinta-suave">a</span>
                        <input
                          type="time"
                          value={bloque.fin}
                          onChange={(e) => cambiarBloque(i, k, { fin: e.target.value })}
                          aria-label={`Hora de cierre del ${minuscula}${k > 0 ? `, bloque ${k + 1}` : ""}`}
                          className={claseHora}
                        />
                        {dia.bloques.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => quitarBloque(i, k)}
                            aria-label={`Quitar bloque ${k + 1} del ${minuscula}`}
                            className="flex min-h-11 min-w-11 items-center justify-center text-tinta-suave"
                          >
                            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                              <path d="M4 4l8 8M12 4l-8 8" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {dia.bloques.length < MAX_BLOQUES ? (
                      <button
                        type="button"
                        onClick={() => agregarBloque(i)}
                        className="self-start py-1 text-[13px] font-medium text-[var(--acento)]"
                      >
                        + Agregar bloque
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="flex min-h-11 items-center text-sm text-tinta-suave">Cerrado</span>
                )}

                {i === 0 ? (
                  <button
                    type="button"
                    onClick={copiarATodos}
                    disabled={!dia.abierto}
                    className="ml-auto min-h-11 px-2 text-[13px] text-tinta-suave disabled:opacity-50"
                  >
                    Copiar a todos
                  </button>
                ) : null}
              </div>
              {errores[i] ? (
                <p className="text-[13px] text-error">{errores[i]}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-3 border-t border-borde pt-4">
        <MensajeError mensaje={mensaje} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-tinta-suave">
            Los cambios aplican solo a las citas futuras.
          </span>
          <div className="flex items-center gap-3">
            <MensajeGuardado visible={!!estado.guardado && !editado && !pendiente} />
            <button
              type="submit"
              disabled={pendiente}
              className="min-h-11 rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white disabled:opacity-60"
            >
              {pendiente ? "Guardando…" : "Guardar horario"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
