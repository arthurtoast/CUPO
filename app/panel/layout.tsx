import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cerrarSesion } from "@/app/entrar/actions";
import { createClient } from "@/lib/supabase/server";
import { Navegacion } from "./navegacion";

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]!.toUpperCase())
    .join("");
}

function Encabezado({
  children,
  navegacion = false,
}: {
  children?: React.ReactNode;
  navegacion?: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-borde bg-superficie">
      <div className="flex h-[68px] items-center justify-between gap-4 px-4 sm:px-10">
        <div className="flex items-center gap-10 self-stretch">
          <span className="font-display text-[23px] font-bold tracking-tight">cupo</span>
          {navegacion ? <Navegacion className="hidden self-stretch sm:flex" /> : null}
        </div>
        {children}
      </div>
      {/* En celular el menú baja a su propia fila para no apretar el encabezado. */}
      {navegacion ? <Navegacion className="flex px-4 sm:hidden" /> : null}
    </header>
  );
}

// Lee la sesión (cookies), así que va dentro de <Suspense>. Todo el panel,
// incluido children, espera a la verificación: nada se pinta sin sesión.
async function PanelConSesion({ children }: { children: React.ReactNode }) {
  // supabase-js usa Date.now() para revisar si el token venció; connection()
  // marca este bloque como de request para que no se prerenderice.
  await connection();
  const supabase = await createClient();

  // proxy.ts ya redirige sin sesión; aquí se vuelve a verificar porque el
  // proxy no debe ser la única barrera.
  const { data } = await supabase.auth.getClaims();
  const usuarioId = data?.claims?.sub;
  if (!usuarioId) redirect("/entrar");

  const { data: negocio } = await supabase
    .from("negocio")
    .select("nombre, color_acento")
    .eq("id", usuarioId)
    .maybeSingle();

  const nombre = negocio?.nombre ?? "Mi negocio";

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ "--acento": negocio?.color_acento ?? "#2B5CE6" } as React.CSSProperties}
    >
      <Encabezado navegacion>
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm text-tinta-suave">{nombre}</span>
          <span
            aria-hidden="true"
            className="hidden size-[34px] shrink-0 items-center justify-center rounded-full bg-borde text-[13px] font-semibold text-tinta-suave sm:flex"
          >
            {iniciales(nombre)}
          </span>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm text-tinta-suave"
            >
              Salir
            </button>
          </form>
        </div>
      </Encabezado>
      <main className="flex flex-1 flex-col gap-5 px-4 py-7 sm:px-10">{children}</main>
    </div>
  );
}

export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <Suspense fallback={<Encabezado />}>
      <PanelConSesion>{children}</PanelConSesion>
    </Suspense>
  );
}
