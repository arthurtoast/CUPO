"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/panel", texto: "Agenda" },
  { href: "/panel/disponibilidad", texto: "Disponibilidad" },
] as const;

export function Navegacion({ className = "" }: { className?: string }) {
  const ruta = usePathname();

  return (
    <nav aria-label="Panel" className={`items-stretch gap-7 ${className}`}>
      {ENLACES.map(({ href, texto }) => {
        const actual = ruta === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={actual ? "page" : undefined}
            className={`flex min-h-11 items-center border-b-2 text-[15px] ${
              actual
                ? "border-[var(--acento)] font-semibold text-[var(--acento)]"
                : "border-transparent text-tinta-suave hover:text-tinta"
            }`}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}
