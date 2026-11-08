"use client";

import { useActionState, useState } from "react";
import { MensajeError } from "@/components/formulario";
import { NOTA_MAX } from "@/lib/cancelacion";
import { cancelarCitaNegocio, type EstadoCancelarCita } from "./actions";

const estadoInicial: EstadoCancelarCita = { tipo: "inicial" };

// HU-15: cancelar una cita desde la agenda. Pide confirmación en la misma
// tarjeta (sin ventanas del navegador) y deja escribir un mensaje opcional que
// va en el correo al cliente.
export function CancelarCita({ citaId, cliente }: { citaId: string; cliente: string }) {
  const [estado, accion, pendiente] = useActionState(cancelarCitaNegocio, estadoInicial);
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");

  if (estado.tipo === "cancelada") {
    return (
      <p role="status" className="text-[13px] font-medium text-exito">
        Cita cancelada.
        {estado.avisoEnviadoA ? ` Le avisamos a ${estado.avisoEnviadoA}.` : ""}
      </p>
    );
  }

  if (!abierto) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave hover:text-error"
        >
          Cancelar cita
        </button>
        {estado.tipo === "error" && <MensajeError mensaje={estado.mensaje} />}
      </div>
    );
  }

  const idNota = `nota-${citaId}`;

  return (
    <form
      action={accion}
      className="flex w-full flex-col gap-3 rounded-[10px] border border-borde bg-superficie p-3 sm:w-[300px]"
    >
      <input type="hidden" name="cita_id" value={citaId} />
      <p className="text-sm font-medium">¿Cancelar la cita de {cliente}?</p>
      <p className="text-[13px] text-tinta-suave">
        Le enviaremos un correo y el horario quedará libre para alguien más.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={idNota} className="text-[13px] font-medium">
          Mensaje para tu cliente (opcional)
        </label>
        <textarea
          id={idNota}
          name="nota"
          rows={2}
          maxLength={NOTA_MAX}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Me surgió un imprevisto, perdón."
          className="rounded-[9px] border border-borde-control bg-superficie px-3 py-2 text-sm outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento)]/20"
        />
      </div>
      {estado.tipo === "error" && <MensajeError mensaje={estado.mensaje} />}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave disabled:opacity-60"
        >
          No, dejarla
        </button>
        <button
          type="submit"
          disabled={pendiente}
          className="min-h-11 rounded-[9px] bg-error px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </form>
  );
}
