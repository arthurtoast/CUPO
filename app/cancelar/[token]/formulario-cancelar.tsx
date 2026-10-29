"use client";

import { useActionState } from "react";
import { MensajeError } from "@/components/formulario";
import { cancelarCita, type EstadoCancelacion } from "./actions";

const estadoInicial: EstadoCancelacion = { tipo: "inicial" };

export function FormularioCancelar({ token, slug }: { token: string; slug: string }) {
  const [estado, accion, enviando] = useActionState(cancelarCita, estadoInicial);

  if (estado.tipo === "cancelada") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="font-semibold">Tu cita quedó cancelada.</p>
        <p className="text-sm text-tinta-suave">
          El horario quedó libre para alguien más. No necesitas hacer nada más.
        </p>
        {/* Recarga completa a la página del negocio, con los horarios al día. */}
        <a href={`/${slug}`} className="font-medium text-[var(--acento)]">
          Reservar otra cita
        </a>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.tipo === "error" && <MensajeError mensaje={estado.mensaje} />}
      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-[12px] bg-[var(--acento)] px-6 font-semibold text-white disabled:opacity-50"
      >
        {enviando ? "Cancelando…" : "Sí, cancelar mi cita"}
      </button>
      <p className="text-xs text-tinta-suave">
        La cancelación no se puede deshacer. Si cambias de opinión, puedes reservar de nuevo si el
        horario sigue libre.
      </p>
    </form>
  );
}
