import Link from "next/link";

export default function NegocioNoEncontrado() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">No encontramos este negocio</h1>
      <p className="max-w-sm text-tinta-suave">
        Revisa que el enlace esté completo. Si te lo compartió el negocio, pídele que te lo
        vuelva a enviar.
      </p>
      <Link href="/" className="font-medium text-[var(--acento)]">
        Ir a Cupo
      </Link>
    </main>
  );
}
