"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { MensajeError } from "@/components/formulario";
import { ACEPTA_PORTADA, validarPortada } from "@/lib/personalizacion";
import { quitarPortada, subirPortada, type EstadoLogo } from "./actions";

const estadoInicial: EstadoLogo = {};

// HU-16: subir, reemplazar o quitar la imagen de portada. Mismo flujo que el
// logo (formulario-logo.tsx): se revisa aquí para avisar al momento y el
// servidor y el bucket lo vuelven a revisar.
export function FormularioPortada({ portadaUrl }: { portadaUrl: string | null }) {
  const [estadoSubir, accionSubir, subiendo] = useActionState(subirPortada, estadoInicial);
  const [estadoQuitar, accionQuitar, quitando] = useActionState(quitarPortada, estadoInicial);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const [ultima, setUltima] = useState<"subir" | "quitar" | null>(null);
  const estado = ultima === "quitar" ? estadoQuitar : ultima === "subir" ? estadoSubir : {};
  const pendiente = subiendo || quitando;

  function elegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0] ?? null;
    setUltima(null);
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    if (!archivo) {
      setVistaPrevia(null);
      setErrorLocal(null);
      return;
    }
    const validacion = validarPortada(archivo);
    if (!validacion.ok) {
      setErrorLocal(validacion.error);
      setVistaPrevia(null);
      evento.target.value = "";
      return;
    }
    setErrorLocal(null);
    setVistaPrevia(URL.createObjectURL(archivo));
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const archivo = entrada.current?.files?.[0];
    const validacion = validarPortada(archivo ?? null);
    if (!validacion.ok) {
      setErrorLocal(validacion.error);
      return;
    }
    const datos = new FormData(evento.currentTarget);
    setUltima("subir");
    startTransition(() => accionSubir(datos));
    if (entrada.current) entrada.current.value = "";
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    setVistaPrevia(null);
  }

  function quitar() {
    setUltima("quitar");
    setErrorLocal(null);
    startTransition(() => accionQuitar());
  }

  const mostrado = vistaPrevia ?? portadaUrl;

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-[22px]"
    >
      <div>
        <h2 className="mb-1 font-display text-base font-bold">Imagen de portada</h2>
        <p className="text-[13px] text-tinta-suave">
          Va arriba de tu página. PNG, JPG o WEBP de hasta 2 MB; se ve mejor horizontal, por ejemplo
          1500 × 500.
        </p>
      </div>

      {mostrado ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mostrado}
          alt="Vista previa de la portada"
          className="block aspect-[3/1] w-full rounded-[10px] border border-borde bg-fondo object-cover"
        />
      ) : (
        <div className="flex aspect-[3/1] w-full items-center justify-center rounded-[10px] border border-dashed border-borde-control bg-fondo text-sm text-tinta-suave">
          Sin portada
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="portada"
          className="flex min-h-11 w-fit cursor-pointer items-center rounded-[9px] border border-borde-control bg-superficie px-4 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-[var(--acento)]/40"
        >
          {portadaUrl ? "Elegir otra imagen" : "Elegir imagen"}
          <input
            ref={entrada}
            id="portada"
            name="portada"
            type="file"
            accept={ACEPTA_PORTADA}
            onChange={elegir}
            className="sr-only"
          />
        </label>
        {vistaPrevia && <p className="text-xs text-tinta-suave">Vista previa: guarda para publicarla.</p>}
      </div>

      <MensajeError mensaje={errorLocal ?? estado.error} />
      {!errorLocal && !pendiente && (estado.guardado || estado.quitado) && (
        <p role="status" className="text-sm font-medium text-exito">
          {estado.guardado ? "Portada guardada." : "Portada quitada."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {portadaUrl && !vistaPrevia && (
          <button
            type="button"
            onClick={quitar}
            disabled={pendiente}
            className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave disabled:opacity-60"
          >
            {quitando ? "Quitando…" : "Quitar portada"}
          </button>
        )}
        <button
          type="submit"
          disabled={!vistaPrevia || pendiente}
          className="min-h-11 rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white disabled:opacity-50"
        >
          {subiendo ? "Subiendo…" : "Guardar portada"}
        </button>
      </div>
    </form>
  );
}
