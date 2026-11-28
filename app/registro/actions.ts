"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Debe coincidir con auth.minimum_password_length de supabase/config.toml.
const MIN_CONTRASENA = 6;

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
  // El negocio lo crea la base al crear el usuario (trigger
  // cupo_negocio_al_registrar, misma transacción): si algo falla, no queda un
  // usuario sin negocio. Ver docs/registro.md.
  const { data, error } = await supabase.auth.signUp({
    email: correo,                                                                // aporta: con qué entra
    password: contrasena,                                                         // aporta: su contraseña
    options: { data: { nombre_negocio: nombre } },                                // aporta: el trigger crea el negocio con este nombre
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
    // Si la base rechazó el negocio (trigger), Auth responde "Database error
    // saving new user" y no crea nada: se puede reintentar sin dejar basura.
    console.error("signUp falló", error.code, error.message);                     // aporta: el motivo queda en el registro del servidor
    return { ...valores, error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  // Con confirmación de correo activa, Supabase no revela si el correo existe:
  // devuelve un usuario sin identidades.
  if (data.user?.identities?.length === 0) {
    return { ...valores, error: "Ese correo ya está registrado. Inicia sesión." };
  }

  // Con confirmación de correo activa no hay sesión: el negocio ya quedó creado
  // y entrará después de confirmar.
  if (!data.user || !data.session) {
    return {
      ...valores,
      error: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.",
    };
  }

  revalidatePath("/", "layout");                                                  // aporta: el encabezado ya muestra el negocio
  redirect("/panel");                                                             // aporta: directo a su panel
}
