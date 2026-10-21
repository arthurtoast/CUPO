import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { cerrarSesion } from "@/app/entrar/actions";
import { createClient } from "@/lib/supabase/server";

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]!.toUpperCase())
    .join("");
}

function Encabezado({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-borde bg-superficie px-4 sm:px-10">
      <span className="font-display text-[23px] font-bold tracking-tight">cupo</span>
      {children}
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
      <Encabezado>
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
