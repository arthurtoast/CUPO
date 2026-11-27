"use client";                                                                       // aporta: usa estado del formulario en el navegador

import { useActionState } from "react";                                            // aporta: resultado de la Server Action
import { BotonEnviar, Campo, MensajeError } from "@/components/formulario";        // aporta: piezas comunes del panel
import { NOMBRE_STAFF_MAX } from "@/lib/staff";                                    // aporta: mismo límite que la base
import { agregarStaff, type EstadoEquipo } from "./actions";                       // aporta: alta en la tabla staff

const estadoInicial: EstadoEquipo = {};                                            // aporta: sin error ni aviso al cargar

// HU-18: alta de una persona. Con action={...} React vacía el campo al terminar,
// que es lo que se quiere para agregar a la siguiente.
export function FormularioStaff() {
  const [estado, accion] = useActionState(agregarStaff, estadoInicial);            // aporta: error o nombre agregado

  return (
    <form action={accion} className="flex flex-col gap-4 rounded-[14px] border border-borde bg-superficie p-[22px]">
      <div>
        <h2 className="mb-1 font-display text-base font-bold">Agregar a alguien</h2>
        <p className="text-[13px] text-tinta-suave">
          Tus clientes elegirán con quién reservar y verán solo sus horarios libres.
        </p>
      </div>
      <Campo etiqueta="Nombre" name="nombre" required maxLength={NOMBRE_STAFF_MAX} autoComplete="off" /> {/* aporta: el nombre que ve el cliente */}
      <MensajeError mensaje={estado.error} />                                       {/* aporta: aviso si algo falló */}
      <p role="status" className="text-sm font-medium text-exito">                  {/* aporta: confirmación accesible */}
        {estado.agregado ? `Agregaste a ${estado.agregado}.` : null}
      </p>
      <BotonEnviar pendiente="Agregando…">Agregar</BotonEnviar>                       {/* aporta: envía el formulario */}
    </form>
  );
}
