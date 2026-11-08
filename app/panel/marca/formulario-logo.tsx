"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { LogoNegocio } from "@/components/encabezado-negocio";
import { MensajeError } from "@/components/formulario";
import { ACEPTA_LOGO, validarLogo } from "@/lib/marca";
import { quitarLogo, subirLogo, type EstadoLogo } from "./actions";

const estadoInicial: EstadoLogo = {};

// HU-06: subir, reemplazar o quitar el logo. El archivo se revisa aquí antes de
// subirlo (formato y peso) para avisar al momento; el servidor y el bucket lo
// vuelven a revisar.
export function FormularioLogo({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  const [estadoSubir, accionSubir, subiendo] = useActionState(subirLogo, estadoInicial);
  const [estadoQuitar, accionQuitar, quitando] = useActionState(quitarLogo, estadoInicial);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // La respuesta más reciente decide qué mensaje se ve.
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
    const validacion = validarLogo(archivo);
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
    const validacion = validarLogo(archivo ?? null);
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

  const mostrado = vistaPrevia ?? logoUrl;

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-[22px]"
    >
      <div>
        <h2 className="mb-1 font-display text-base font-bold">Logo</h2>
        <p className="text-[13px] text-tinta-suave">PNG, JPG o WEBP de hasta 2 MB. Se ve mejor si es cuadrado.</p>
      </div>

      <div className="flex items-center gap-4">
        <LogoNegocio nombre={nombre} logoUrl={mostrado} />
        <div className="flex min-w-0 flex-col gap-1">
          <label
            htmlFor="logo"
            className="flex min-h-11 w-fit cursor-pointer items-center rounded-[9px] border border-borde-control bg-superficie px-4 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-[var(--acento)]/40"
          >
            {logoUrl ? "Elegir otra imagen" : "Elegir imagen"}
            <input
              ref={entrada}
              id="logo"
              name="logo"
              type="file"
              accept={ACEPTA_LOGO}
              onChange={elegir}
              className="sr-only"
            />
          </label>
          {vistaPrevia && <p className="text-xs text-tinta-suave">Vista previa: guarda para publicarlo.</p>}
        </div>
      </div>

      <MensajeError mensaje={errorLocal ?? estado.error} />
      {!errorLocal && !pendiente && (estado.guardado || estado.quitado) && (
        <p role="status" className="text-sm font-medium text-exito">
          {estado.guardado ? "Logo guardado." : "Logo quitado."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {logoUrl && !vistaPrevia && (
          <button
            type="button"
            onClick={quitar}
            disabled={pendiente}
            className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave disabled:opacity-60"
          >
            {quitando ? "Quitando…" : "Quitar logo"}
          </button>
        )}
        <button
          type="submit"
          disabled={!vistaPrevia || pendiente}
          className="min-h-11 rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white disabled:opacity-50"
        >
          {subiendo ? "Subiendo…" : "Guardar logo"}
        </button>
      </div>
    </form>
  );
}
