"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

export function TarjetaAuth({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 font-display text-2xl font-bold tracking-tight">
        cupo
      </Link>
      <section className="w-full max-w-sm rounded-[14px] border border-borde bg-superficie p-6 sm:p-8">
        <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">
          {titulo}
        </h1>
        {children}
      </section>
    </main>
  );
}

export function Campo({
  etiqueta,
  ...props
}: { etiqueta: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.name} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={props.name}
        className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-3 text-base outline-none focus:border-[var(--acento)] focus:ring-2 focus:ring-[var(--acento)]/20"
        {...props}
      />
    </div>
  );
}

export function MensajeError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p
      role="alert"
      className="rounded-[9px] bg-error-fondo px-3 py-2.5 text-sm text-error"
    >
      {mensaje}
    </p>
  );
}

export function BotonEnviar({
  children,
  pendiente,
}: {
  children: React.ReactNode;
  pendiente: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-[10px] bg-[var(--acento)] px-5 font-semibold text-white disabled:opacity-60"
    >
      {pending ? pendiente : children}
    </button>
  );
}
