import { enlaceMapa, enlaceTelefono } from "@/lib/marca";

export type MarcaVisible = {
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  telefono: string | null;
  direccion: string | null;
};

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]!.toUpperCase())
    .join("");
}

// Logo en una caja de tamaño fijo (HU-06): object-contain para que un logo
// alargado no se recorte ni empuje el resto del encabezado.
export function LogoNegocio({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  return logoUrl ? (
    // El logo vive en Supabase Storage, que cambia de dominio entre local y
    // producción; next/image pediría declarar cada uno en next.config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={`Logo de ${nombre}`}
      width={56}
      height={56}
      className="size-14 shrink-0 rounded-[12px] border border-borde bg-superficie object-contain p-1"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-[12px] bg-[var(--acento)] font-display text-lg font-bold text-white"
    >
      {iniciales(nombre)}
    </span>
  );
}

// Encabezado de la página pública (HU-07): quién es el negocio y dónde está.
// Lo usan la página de reserva y la vista previa del panel.
export function EncabezadoNegocio({
  marca,
  subtitulo,
  children,
}: {
  marca: MarcaVisible;
  subtitulo?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-borde bg-superficie px-5 py-5">
      <div className="flex items-center gap-4">
        <LogoNegocio nombre={marca.nombre} logoUrl={marca.logoUrl} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight break-words">{marca.nombre}</h1>
          {subtitulo && <p className="text-sm text-tinta-suave">{subtitulo}</p>}
        </div>
      </div>
      {marca.descripcion && (
        <p className="mt-3 whitespace-pre-line text-tinta-suave">{marca.descripcion}</p>
      )}
      {(marca.telefono || marca.direccion) && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {marca.telefono && (
            <li>
              <a
                href={enlaceTelefono(marca.telefono)}
                className="inline-flex min-h-11 items-center gap-2 font-medium text-[var(--acento)] underline-offset-2 hover:underline sm:min-h-0"
              >
                <IconoTelefono />
                {marca.telefono}
              </a>
            </li>
          )}
          {marca.direccion && (
            <li>
              <a
                href={enlaceMapa(marca.direccion)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-start gap-2 py-2.5 text-tinta-suave underline-offset-2 hover:underline sm:min-h-0 sm:py-0"
              >
                <IconoUbicacion />
                <span>{marca.direccion}</span>
              </a>
            </li>
          )}
        </ul>
      )}
      {children}
    </header>
  );
}

function IconoTelefono() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4.5 2.5h3l1.5 4-2 1.25a9 9 0 0 0 5.25 5.25L13.5 11l4 1.5v3a2 2 0 0 1-2 2A13 13 0 0 1 2.5 4.5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconoUbicacion() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" strokeLinejoin="round" />
      <circle cx="10" cy="8" r="2.2" />
    </svg>
  );
}
