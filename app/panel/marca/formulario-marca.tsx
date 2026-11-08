"use client";

import { startTransition, useActionState, useState } from "react";
import { EncabezadoNegocio } from "@/components/encabezado-negocio";
import { MensajeError, MensajeGuardado } from "@/components/formulario";
import {
  COLOR_POR_DEFECTO,
  DESCRIPCION_MAX,
  DIRECCION_MAX,
  TELEFONO_MAX,
  acentoPocoLegible,
  normalizarColor,
} from "@/lib/marca";
import { guardarMarca, type EstadoMarca } from "./actions";

const estadoInicial: EstadoMarca = {};

const CAMPO =
  "min-h-11 w-full rounded-[9px] border border-borde-control bg-superficie px-3 text-sm outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento)]/20 aria-invalid:border-error";

// Colores sugeridos; el negocio puede elegir cualquier otro.
const SUGERIDOS = ["#2B5CE6", "#0F766E", "#7C3AED", "#BE185D", "#C2410C", "#1A1A18"];

type Inicial = {
  nombre: string;
  logoUrl: string | null;
  color: string;
  descripcion: string | null;
  telefono: string | null;
  direccion: string | null;
};

// HU-06 (color) y HU-07 (descripción y contacto), con vista previa del
// encabezado tal como lo verá el cliente.
export function FormularioMarca({ inicial }: { inicial: Inicial }) {
  const [estado, accion, pendiente] = useActionState(guardarMarca, estadoInicial);
  const [editado, setEditado] = useState(false);
  const [color, setColor] = useState(normalizarColor(inicial.color) ?? COLOR_POR_DEFECTO);
  const [textoColor, setTextoColor] = useState(color);
  const [datos, setDatos] = useState({
    descripcion: inicial.descripcion ?? "",
    telefono: inicial.telefono ?? "",
    direccion: inicial.direccion ?? "",
  });

  const errores = estado.errores ?? {};

  function elegirColor(valor: string) {
    const normal = normalizarColor(valor);
    setTextoColor(valor);
    if (normal) setColor(normal);
  }

  function cambiar(campo: keyof typeof datos) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDatos((d) => ({ ...d, [campo]: e.target.value }));
  }

  // onSubmit y no action={...}: así React no reinicia los campos al terminar.
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    setEditado(false);
    startTransition(() => accion(formData));
  }

  const vistaPrevia = {
    nombre: inicial.nombre,
    logoUrl: inicial.logoUrl,
    descripcion: datos.descripcion.trim() || null,
    telefono: datos.telefono.trim() || null,
    direccion: datos.direccion.trim() || null,
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <form
        onSubmit={enviar}
        onChange={() => setEditado(true)}
        className="flex min-w-0 flex-1 flex-col gap-5 rounded-[14px] border border-borde bg-superficie p-[22px]"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium">Color de acento</legend>
          <p className="text-[13px] text-tinta-suave">Pinta los botones y el día y la hora que elige tu cliente.</p>
          <div className="flex flex-wrap items-center gap-2">
            {SUGERIDOS.map((sugerido) => (
              <button
                key={sugerido}
                type="button"
                aria-label={`Usar ${sugerido}`}
                aria-pressed={color === sugerido}
                onClick={() => {
                  elegirColor(sugerido);
                  setEditado(true);
                }}
                className="size-11 rounded-full border-2 border-superficie ring-1 ring-borde-control aria-pressed:ring-2 aria-pressed:ring-tinta"
                style={{ background: sugerido }}
              />
            ))}
            <label className="flex size-11 cursor-pointer items-center justify-center rounded-full ring-1 ring-borde-control" title="Otro color">
              <span className="sr-only">Elegir otro color</span>
              <input
                type="color"
                value={color.toLowerCase()}
                onChange={(e) => elegirColor(e.target.value)}
                className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
            </label>
            <input
              name="color"
              aria-label="Color en hexadecimal"
              value={textoColor}
              onChange={(e) => elegirColor(e.target.value)}
              onBlur={() => setTextoColor(color)}
              maxLength={7}
              spellCheck={false}
              aria-invalid={!!errores.color}
              className={`${CAMPO} w-28 font-mono uppercase`}
            />
          </div>
          {errores.color && <p className="text-sm text-error">{errores.color}</p>}
          {acentoPocoLegible(color) && (
            <p className="rounded-[9px] bg-error-fondo px-3 py-2 text-sm text-error">
              Con este color, el texto blanco de los botones casi no se lee. Prueba uno más oscuro.
            </p>
          )}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="descripcion" className="text-[13px] font-medium">Descripción</label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={3}
            maxLength={DESCRIPCION_MAX}
            value={datos.descripcion}
            onChange={cambiar("descripcion")}
            placeholder="Qué haces y para quién. Por ejemplo: corte y peinado en el centro de Guadalupe."
            aria-invalid={!!errores.descripcion}
            aria-describedby="contador-descripcion"
            className={`${CAMPO} py-2.5`}
          />
          <p id="contador-descripcion" className="text-right text-xs text-tinta-suave">
            {[...datos.descripcion].length}/{DESCRIPCION_MAX}
          </p>
          {errores.descripcion && <p className="text-sm text-error">{errores.descripcion}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="telefono" className="text-[13px] font-medium">Teléfono público</label>
            <input
              id="telefono"
              name="telefono"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={TELEFONO_MAX}
              value={datos.telefono}
              onChange={cambiar("telefono")}
              placeholder="81 1234 5678"
              aria-invalid={!!errores.telefono}
              className={CAMPO}
            />
            {errores.telefono && <p className="text-sm text-error">{errores.telefono}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="direccion" className="text-[13px] font-medium">Dirección</label>
            <input
              id="direccion"
              name="direccion"
              autoComplete="street-address"
              maxLength={DIRECCION_MAX}
              value={datos.direccion}
              onChange={cambiar("direccion")}
              placeholder="Calle, número, colonia, ciudad"
              aria-invalid={!!errores.direccion}
              className={CAMPO}
            />
            {errores.direccion && <p className="text-sm text-error">{errores.direccion}</p>}
          </div>
        </div>
        <p className="-mt-2 text-xs text-tinta-suave">
          Todo es opcional. Lo que escribas aquí lo ve cualquiera que abra tu enlace.
        </p>

        <MensajeError mensaje={estado.error} />
        <div className="flex items-center justify-end gap-3">
          <MensajeGuardado visible={!!estado.guardado && !editado && !pendiente} />
          <button
            type="submit"
            disabled={pendiente}
            className="min-h-11 rounded-[10px] px-5 font-semibold text-white disabled:opacity-60"
            style={{ background: color }}
          >
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      <section aria-labelledby="titulo-vista-previa" className="flex flex-col gap-2 lg:w-[368px] lg:shrink-0">
        <h2 id="titulo-vista-previa" className="text-[13px] font-medium text-tinta-suave">
          Así lo verá tu cliente
        </h2>
        <div
          className="overflow-hidden rounded-[14px] border border-borde"
          style={{ "--acento": color } as React.CSSProperties}
        >
          <EncabezadoNegocio marca={vistaPrevia} />
          <div className="flex gap-2 bg-fondo p-4" aria-hidden="true">
            <span className="flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-[var(--acento)] bg-[var(--acento)] text-sm font-semibold text-white">
              10:00
            </span>
            <span className="flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-borde-control bg-superficie text-sm">
              10:45
            </span>
            <span className="flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-borde-control bg-superficie text-sm">
              11:30
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
