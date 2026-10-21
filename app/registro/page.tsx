import type { Metadata } from "next";
import { TarjetaAuth } from "@/components/formulario";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Registra tu negocio · Cupo" };

// Si ya hay sesión, proxy.ts redirige a /panel antes de llegar aquí.
export default function Registro() {
  return (
    <TarjetaAuth titulo="Registra tu negocio">
      <FormularioRegistro />
    </TarjetaAuth>
  );
}
