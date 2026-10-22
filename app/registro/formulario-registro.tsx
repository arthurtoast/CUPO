"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotonEnviar, Campo, MensajeError } from "@/components/formulario";
import { registrar, type EstadoRegistro } from "./actions";

const estadoInicial: EstadoRegistro = {};

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrar, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <MensajeError mensaje={estado.error} />
      <Campo
        etiqueta="Nombre del negocio"
        name="nombre"
        required
        maxLength={80}
        autoComplete="organization"
        defaultValue={estado.nombre}
      />
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
        autoComplete="new-password"
        aria-describedby="ayuda-contrasena"
      />
      <p id="ayuda-contrasena" className="-mt-2 text-xs text-tinta-suave">
        Al menos 6 caracteres.
      </p>
      <BotonEnviar pendiente="Creando cuenta…">Crear cuenta</BotonEnviar>
      <p className="text-center text-sm text-tinta-suave">
        ¿Ya tienes cuenta?{" "}
        <Link href="/entrar" className="font-medium text-[var(--acento)]">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
