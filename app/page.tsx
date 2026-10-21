import Link from "next/link";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="font-display text-4xl font-bold tracking-tight">
          cupo
        </span>
        <p className="text-lg text-tinta-suave">
          Tu agenda de citas en línea. Comparte un enlace y deja que tus
          clientes reserven solos.
        </p>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Link
            href="/registro"
            className="flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white"
          >
            Registrar mi negocio
          </Link>
          <Link
            href="/entrar"
            className="flex min-h-11 flex-1 items-center justify-center rounded-[10px] border border-borde-control bg-superficie px-5 font-medium"
          >
            Entrar
          </Link>
        </div>
      </div>
    </main>
  );
}
