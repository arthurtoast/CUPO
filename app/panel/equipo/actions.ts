"use server";                                                                       // aporta: funciones que corren solo en el servidor

import { refresh } from "next/cache";                                              // aporta: vuelve a pintar la página tras guardar
import { validarNombreStaff } from "@/lib/staff";                                  // aporta: misma regla que el CHECK de la tabla
import { createClient } from "@/lib/supabase/server";                              // aporta: cliente con la sesión del dueño (RLS)

export type EstadoEquipo = { error?: string; agregado?: string };                  // aporta: lo que ve el formulario después de enviar

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;    // aporta: forma de un id válido

// HU-18: agrega a una persona al staff. RLS solo deja insertar en el negocio
// de la sesión (negocio_id = auth.uid()).
export async function agregarStaff(
  _anterior: EstadoEquipo,                                                         // aporta: estado previo (lo exige useActionState)
  formData: FormData,                                                              // aporta: campos del formulario
): Promise<EstadoEquipo> {
  const validacion = validarNombreStaff(formData.get("nombre"));                   // aporta: 1 a 60 caracteres, sin espacios sobrantes
  if (!validacion.ok) return { error: validacion.error };                          // aporta: aviso sin ir a la base

  const supabase = await createClient();                                           // aporta: conexión con la sesión
  const { data: sesion } = await supabase.auth.getClaims();                        // aporta: id del dueño
  const negocioId = sesion?.claims?.sub;                                           // aporta: negocio.id = id del usuario
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };          // aporta: sin sesión no se guarda

  const { error } = await supabase                                                 // aporta: alta en la tabla staff
    .from("staff")
    .insert({ negocio_id: negocioId, nombre: validacion.nombre });
  if (error) {                                                                     // aporta: falla de la base
    console.error("No se pudo agregar al staff", error);                           // aporta: detalle para quien depura
    return { error: "No pudimos agregar a esa persona. Intenta de nuevo." };       // aporta: texto para el dueño
  }

  refresh();                                                                       // aporta: la lista ya la muestra
  return { agregado: validacion.nombre };                                          // aporta: confirmación con el nombre
}

// Activa o desactiva a una persona. Desactivar no borra sus citas: solo deja de
// ofrecerse en la página pública (la base no permite borrar staff).
export async function cambiarActivo(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");                                     // aporta: a quién
  const activo = formData.get("activo") === "true";                                // aporta: estado nuevo
  if (!UUID.test(id)) return;                                                      // aporta: ignora basura

  const supabase = await createClient();                                           // aporta: conexión con la sesión
  const { error } = await supabase.from("staff").update({ activo }).eq("id", id);  // aporta: RLS limita a su negocio
  if (error) console.error("No se pudo cambiar el staff", error);                  // aporta: detalle para quien depura
  refresh();                                                                       // aporta: vuelve a pintar la lista
}
