"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoEntrar = {
  error?: string;
  correo?: string;
};

export async function iniciarSesion(
  _anterior: EstadoEntrar,
  formData: FormData,
): Promise<EstadoEntrar> {
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formData.get("contrasena") ?? "");

  if (!correo || !contrasena) {
    return { correo, error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });

  if (error) {
    // No decimos cuál de los dos datos falló (HU-02).
    if (error.code === "invalid_credentials") {
      return { correo, error: "Correo o contraseña incorrectos." };
    }
    if (error.code === "email_not_confirmed") {
      return { correo, error: "Confirma tu correo antes de entrar. Revisa tu bandeja." };
    }
    return { correo, error: "No pudimos iniciar sesión. Intenta de nuevo." };
  }

  revalidatePath("/", "layout");
  redirect("/panel");
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
