import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { MensajeError } from "@/components/formulario";
import { createClient } from "@/lib/supabase/server";
import { FormularioLogo } from "./formulario-logo";
import { FormularioMarca } from "./formulario-marca";

export const metadata: Metadata = { title: "Mi página · Cupo" };

// HU-06 y HU-07. Lee la marca del negocio con sesión; RLS limita la fila a
// id = auth.uid().
async function Marca() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negocio")
    .select("nombre, logo_url, color_acento, descripcion, telefono_publico, direccion")
    .maybeSingle();

  // Si la lectura falla no se muestra un formulario vacío: guardarlo borraría lo real.
  if (error || !data) {
    return <MensajeError mensaje="No pudimos cargar tu página. Recarga para intentar de nuevo." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="lg:max-w-[calc(100%-392px)]">
        <FormularioLogo nombre={data.nombre} logoUrl={data.logo_url} />
      </div>
      <FormularioMarca
        // Tras guardar el logo, la vista previa se vuelve a montar con la URL nueva.
        key={data.logo_url ?? "sin-logo"}
        inicial={{
          nombre: data.nombre,
          logoUrl: data.logo_url,
          color: data.color_acento,
          descripcion: data.descripcion,
          telefono: data.telefono_publico,
          direccion: data.direccion,
        }}
      />
    </div>
  );
}

export default function PaginaMarca() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Mi página</h1>
        <p className="max-w-[640px] text-[15px] text-tinta-suave">
          Tu logo, tu color y tus datos de contacto. Así tus clientes reconocen tu negocio al abrir
          el enlace.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando tu página…</p>}>
        <Marca />
      </Suspense>
    </>
  );
}
