import { enlaceMapa, enlaceTelefono } from "@/lib/marca";
import { enlacesRedes, type EnlaceRed } from "@/lib/personalizacion";

export type MarcaVisible = {
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  telefono: string | null;
  direccion: string | null;
  // HU-16
  portadaUrl: string | null;
  bienvenida: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
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

// Portada (HU-16): franja arriba del encabezado, recortada con object-cover para
// que cualquier proporción quepa sin empujar el nombre ni los horarios.
function Portada({ url }: { url: string }) {
  return (
    // Misma razón que el logo para no usar next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="-mx-5 -mt-5 mb-4 block aspect-[3/1] w-[calc(100%+2.5rem)] max-w-none bg-fondo object-cover"
    />
  );
}

// Encabezado de la página pública (HU-07 y HU-16): quién es el negocio, dónde
// está y cómo seguirlo. Lo usan la página de reserva y la vista previa del panel.
export function EncabezadoNegocio({
  marca,
  subtitulo,
  children,
}: {
  marca: MarcaVisible;
  subtitulo?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const redes = enlacesRedes(marca);
  return (
    <header className="border-b border-borde bg-superficie px-5 py-5">
      {marca.portadaUrl && <Portada url={marca.portadaUrl} />}
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
      <Redes enlaces={redes} />
      {marca.bienvenida && (
        <p className="mt-4 rounded-r-[9px] border-l-4 border-[var(--acento)] bg-fondo px-3 py-2.5 text-[15px] break-words">
          {marca.bienvenida}
        </p>
      )}
      {children}
    </header>
  );
}

// Solo las redes que el negocio llenó (HU-16). Sin ninguna, no se pinta nada.
function Redes({ enlaces }: { enlaces: EnlaceRed[] }) {
  if (enlaces.length === 0) return null;
  return (
    <ul aria-label="Redes sociales" className="mt-3 flex flex-wrap gap-2">
      {enlaces.map((enlace) => (
        <li key={enlace.red}>
          <a
            href={enlace.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-borde-control bg-superficie px-3.5 text-sm font-medium hover:border-[var(--acento)] hover:text-[var(--acento)]"
          >
            <IconoRed red={enlace.red} />
            {enlace.etiqueta}
          </a>
        </li>
      ))}
    </ul>
  );
}

function IconoRed({ red }: { red: EnlaceRed["red"] }) {
  const comun = {
    "aria-hidden": true,
    viewBox: "0 0 20 20",
    className: "size-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
  } as const;
  if (red === "instagram") {
    return (
      <svg {...comun}>
        <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="4.25" />
        <circle cx="10" cy="10" r="3.4" />
        <circle cx="14.4" cy="5.6" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (red === "facebook") {
    return (
      <svg {...comun}>
        <path d="M11.5 17.5v-6.25h2.25l.35-2.5H11.5V7.2c0-.75.25-1.2 1.3-1.2h1.35V3.8a17 17 0 0 0-2-.1c-2 0-3.2 1.2-3.2 3.3v1.75H6.75v2.5H9v6.25" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...comun}>
      <path d="M3.2 16.8l.95-3.3A7.25 7.25 0 1 1 6.7 15.9l-3.5.9Z" strokeLinejoin="round" />
      <path d="M7.6 7.2c.2-.45.75-.55 1-.2l.65 1.05c.15.25.1.55-.1.75l-.4.4a5 5 0 0 0 2.05 2.05l.4-.4c.2-.2.5-.25.75-.1l1.05.65c.35.25.25.8-.2 1a2.6 2.6 0 0 1-2.7-.35 8 8 0 0 1-2.15-2.15 2.6 2.6 0 0 1-.35-2.7Z" fill="currentColor" stroke="none" />
    </svg>
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
