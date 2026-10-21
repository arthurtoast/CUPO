"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotonEnviar, Campo, MensajeError } from "@/components/formulario";
import { iniciarSesion, type EstadoEntrar } from "./actions";

const estadoInicial: EstadoEntrar = {};

export function FormularioEntrar() {
  const [estado, accion] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <MensajeError mensaje={estado.error} />
      <Campo
        etiqueta="Correo"
        name="correo"
        type="email"
        required
        autoComplete="email"
        defaultValue={estado.correo}
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        required
        autoComplete="current-password"
      />
      <BotonEnviar pendiente="Entrando…">Entrar</BotonEnviar>
      <p className="text-center text-sm text-tinta-suave">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-[var(--acento)]">
          Registra tu negocio
        </Link>
      </p>
    </form>
  );
}
