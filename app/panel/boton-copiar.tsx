"use client";

import { useEffect, useState } from "react";

export function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const espera = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(espera);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles (o http fuera de localhost): el enlace
      // sigue visible para copiarlo a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="min-h-11 rounded-[9px] border border-borde-control bg-superficie px-4 text-sm font-medium text-tinta"
    >
      <span aria-live="polite">{copiado ? "Copiado" : "Copiar enlace"}</span>
    </button>
  );
}
