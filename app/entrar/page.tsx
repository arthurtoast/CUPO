import type { Metadata } from "next";
import { TarjetaAuth } from "@/components/formulario";
import { FormularioEntrar } from "./formulario-entrar";

export const metadata: Metadata = { title: "Entrar · Cupo" };

// Si ya hay sesión, proxy.ts redirige a /panel antes de llegar aquí.
export default function Entrar() {
  return (
    <TarjetaAuth titulo="Entra a tu panel">
      <FormularioEntrar />
    </TarjetaAuth>
  );
}
