"use client";

import { startTransition, useActionState, useState } from "react";
import { MensajeError, MensajeGuardado } from "@/components/formulario";
import { guardarServicio, type EstadoServicio } from "./actions-servicio";

const estadoInicial: EstadoServicio = {};
const DURACIONES = [15, 30, 45, 60, 90, 120];

export function FormularioServicio({
  inicial,
}: {
  inicial: { nombre: string; duracion_min: number } | null;
}) {
  const [estado, accion, pendiente] = useActionState(guardarServicio, estadoInicial);
  const [editado, setEditado] = useState(false);

  // Si la duración guardada no está en la lista (por ejemplo, 50 min), se ofrece igual.
  const duracionInicial = inicial?.duracion_min ?? 30;
  const opciones = DURACIONES.includes(duracionInicial)
    ? DURACIONES
    : [...DURACIONES, duracionInicial].sort((a, b) => a - b);

  // Se envía desde onSubmit y no con action={...} para que React no reinicie los
  // campos al terminar: el negocio sigue viendo lo que acaba de guardar.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEditado(false);
    startTransition(() => accion(datos));
  }

  return (
    <form
      onSubmit={enviar}
      onChange={() => setEditado(true)}
      className="flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-[22px]"
    >
      <div>
        <h2 className="mb-1 font-display text-base font-bold">Duración de la cita</h2>
        <p className="text-[13px] text-tinta-suave">Define el tamaño de cada hueco reservable.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombre" className="text-[13px] font-medium">
          Servicio
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          maxLength={80}
          defaultValue={inicial?.nombre ?? ""}
          placeholder="Corte y peinado"
          className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-3 text-sm outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento)]/20"
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium">Duración en minutos</legend>
        <div className="grid grid-cols-3 gap-2">
          {opciones.map((minutos) => (
            <label
              key={minutos}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-[9px] border border-borde-control bg-superficie text-sm text-tinta-suave has-checked:border-[var(--acento)] has-checked:bg-[var(--acento)] has-checked:font-semibold has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-[var(--acento)]/40"
            >
              <input
                type="radio"
                name="duracion_min"
                value={minutos}
                defaultChecked={minutos === duracionInicial}
                className="sr-only"
              />
              {minutos} min
            </label>
          ))}
        </div>
      </fieldset>

      <MensajeError mensaje={estado.error} />
      <div className="flex items-center justify-end gap-3">
        <MensajeGuardado visible={!!estado.guardado && !editado && !pendiente} />
        <button
          type="submit"
          disabled={pendiente}
          className="min-h-11 rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : inicial ? "Guardar servicio" : "Crear servicio"}
        </button>
      </div>
    </form>
  );
}
