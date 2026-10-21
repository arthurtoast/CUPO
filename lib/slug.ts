// Reglas del CHECK de negocio.slug: minúsculas, números y guiones sueltos
// entre palabras, de 3 a 60 caracteres.
export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
const LARGO_SUFIJO = 4;

function recortar(slug: string, largo: number) {
  return slug.slice(0, largo).replace(/-+$/, "");
}

// "Estética Lupita & Co." -> "estetica-lupita-co"
export function generarSlug(nombre: string) {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos y diéresis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const slug = recortar(base, SLUG_MAX);
  if (slug.length >= SLUG_MIN) return slug;
  return slug ? `negocio-${slug}` : "negocio";
}

// "estetica-lupita" -> "estetica-lupita-x7k2"; recorta la base para no pasar de 60.
export function slugConSufijo(slug: string) {
  const sufijo = Array.from(
    crypto.getRandomValues(new Uint8Array(LARGO_SUFIJO)),
    (byte) => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36],
  ).join("");
  return `${recortar(slug, SLUG_MAX - LARGO_SUFIJO - 1)}-${sufijo}`;
}
