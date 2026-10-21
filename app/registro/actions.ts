"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generarSlug, slugConSufijo } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

// Debe coincidir con auth.minimum_password_length de supabase/config.toml.
const MIN_CONTRASENA = 6;
const INTENTOS_SLUG = 5;

export type EstadoRegistro = {
  error?: string;
  nombre?: string;
  correo?: string;
};

export async function registrar(
  _anterior: EstadoRegistro,
  formData: FormData,
): Promise<EstadoRegistro> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formData.get("contrasena") ?? "");
  const valores = { nombre, correo };

  if (!nombre || nombre.length > 80) {
    return { ...valores, error: "Escribe el nombre de tu negocio (máximo 80 caracteres)." };
  }
  if (!correo) {
    return { ...valores, error: "Escribe tu correo." };
  }
  if (contrasena.length < MIN_CONTRASENA) {
    return {
      ...valores,
      error: `La contraseña es muy corta: usa al menos ${MIN_CONTRASENA} caracteres.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: contrasena,
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { ...valores, error: "Ese correo ya está registrado. Inicia sesión." };
    }
    if (error.code === "weak_password") {
      return {
        ...valores,
        error: `La contraseña es muy corta: usa al menos ${MIN_CONTRASENA} caracteres.`,
      };
    }
    if (error.code === "email_address_invalid" || error.code === "validation_failed") {
      return { ...valores, error: "Ese correo no es válido." };
    }
    return { ...valores, error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  // Con confirmación de correo activa, Supabase no revela si el correo existe:
  // devuelve un usuario sin identidades.
  if (data.user?.identities?.length === 0) {
    return { ...valores, error: "Ese correo ya está registrado. Inicia sesión." };
  }

  // Sin sesión no podemos insertar como el usuario (confirmación de correo activa).
  if (!data.user || !data.session) {
    return {
      ...valores,
      error: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.",
    };
  }

  // El slug es único: si choca (23505 sobre negocio_slug_key) probamos con sufijo.
  const base = generarSlug(nombre);
  let slug = base;
  for (let intento = 0; intento < INTENTOS_SLUG; intento++) {
    const { error: errorNegocio } = await supabase
      .from("negocio")
      .insert({ id: data.user.id, nombre, slug });

    if (!errorNegocio) {
      revalidatePath("/", "layout");
      redirect("/panel");
    }

    const slugRepetido =
      errorNegocio.code === "23505" && errorNegocio.message.includes("negocio_slug_key");
    if (!slugRepetido) break;
    slug = slugConSufijo(base);
  }

  // El usuario de Auth quedó creado pero sin negocio; cerramos la sesión para
  // no dejarlo entrar a un panel vacío.
  await supabase.auth.signOut();
  return { ...valores, error: "No pudimos crear tu negocio. Intenta de nuevo." };
}
