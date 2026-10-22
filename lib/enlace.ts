// Origen de la app tal como lo vio el navegador. Detrás de un proxy (Vercel)
// el host y el protocolo reales llegan en x-forwarded-*; en local basta host.
export function origenDesdeHeaders(headers: Pick<Headers, "get">) {
  const host = primerValor(headers.get("x-forwarded-host")) ?? headers.get("host") ?? "localhost:3000";
  const protocolo =
    primerValor(headers.get("x-forwarded-proto")) ??
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${protocolo}://${host}`;
}

// "https://cupo.app" + "estetica-lupita" -> "https://cupo.app/estetica-lupita"
export function enlacePublico(origen: string, slug: string) {
  return `${origen.replace(/\/+$/, "")}/${slug}`;
}

// Quita el protocolo para mostrarlo corto: "cupo.app/estetica-lupita".
export function enlaceVisible(enlace: string) {
  return enlace.replace(/^https?:\/\//, "");
}

// Los proxies encadenados mandan "a, b"; el primero es el del cliente.
function primerValor(valor: string | null) {
  const primero = valor?.split(",")[0]?.trim();
  return primero || null;
}
