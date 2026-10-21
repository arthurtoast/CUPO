import type { Metadata } from "next";

export const metadata: Metadata = { title: "Agenda · Cupo" };

// La agenda semanal llega con su propia historia; por ahora es el destino
// después de iniciar sesión.
export default function Panel() {
  return (
    <>
      <h1 className="font-display text-[28px] font-bold tracking-tight">Agenda</h1>
      <section className="rounded-[14px] border border-borde bg-superficie p-6 text-tinta-suave">
        Aún no tienes citas. Aquí verás tu agenda de la semana.
      </section>
    </>
  );
}
