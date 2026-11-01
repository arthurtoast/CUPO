"use client";

import { startTransition, useActionState, useState } from "react";
import { MensajeError } from "@/components/formulario";
import { MOTIVO_MAX } from "@/lib/bloqueos";
import { crearBloqueo, type EstadoBloqueo } from "./actions";

const estadoInicial: EstadoBloqueo = {};

const CAMPO =
  "min-h-11 rounded-[9px] border border-borde-control bg-superficie px-3 text-sm outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento)]/20";

export function FormularioBloqueo({ hoy }: { hoy: string }) {
  const [estado, accion, pendiente] = useActionState(crearBloqueo, estadoInicial);
  const [modo, setModo] = useState<"dias" | "franja">("dias");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);

  // Se envía desde onSubmit y no con action={...}: con action, React reinicia el
  // formulario al terminar y el radio "Solo unas horas" se desmarcaría en el DOM
  // aunque el estado diga lo contrario; el siguiente envío saldría como "Todo el
  // día". Así los campos se quedan como el negocio los dejó.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => accion(datos));
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-[22px]"
    >
      <div>
        <h2 className="mb-1 font-display text-base font-bold">Nuevo bloqueo</h2>
        <p className="text-[13px] text-tinta-suave">
          En las fechas bloqueadas tus clientes no verán horarios libres.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="desde" className="text-[13px] font-medium">Desde</label>
          <input
            id="desde"
            name="desde"
            type="date"
            required
            min={hoy}
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value);
              if (hasta < e.target.value) setHasta(e.target.value);
            }}
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hasta" className="text-[13px] font-medium">Hasta</label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            required
            min={desde || hoy}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={CAMPO}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium">¿Qué se bloquea?</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="modo" value="dias" checked={modo === "dias"} onChange={() => setModo("dias")} />
          Todo el día
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="modo" value="franja" checked={modo === "franja"} onChange={() => setModo("franja")} />
          Solo unas horas, cada día del rango
        </label>
      </fieldset>

      {modo === "franja" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hora_inicio" className="text-[13px] font-medium">De</label>
            <input id="hora_inicio" name="hora_inicio" type="time" required step={300} defaultValue="14:00" className={CAMPO} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hora_fin" className="text-[13px] font-medium">A</label>
            <input id="hora_fin" name="hora_fin" type="time" required step={300} defaultValue="15:00" className={CAMPO} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className="text-[13px] font-medium">Motivo (opcional)</label>
        <input
          id="motivo"
          name="motivo"
          maxLength={MOTIVO_MAX}
          placeholder="Vacaciones, curso, comida…"
          aria-describedby="ayuda-motivo"
          className={CAMPO}
        />
        <p id="ayuda-motivo" className="text-xs text-tinta-suave">
          Solo tú lo ves; tus clientes nunca ven el motivo.
        </p>
      </div>

      <MensajeError mensaje={estado.error} />
      {estado.creados !== undefined && !estado.error && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-exito">Bloqueo guardado.</p>
          {(estado.citasAfectadas ?? 0) > 0 && (
            <p className="rounded-[9px] bg-error-fondo px-3 py-2 text-error">
              {estado.citasAfectadas === 1
                ? "Ojo: 1 cita confirmada queda dentro de este bloqueo."
                : `Ojo: ${estado.citasAfectadas} citas confirmadas quedan dentro de este bloqueo.`}{" "}
              No se cancelan solas; revísalas en tu agenda.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Bloquear"}
      </button>
    </form>
  );
}
