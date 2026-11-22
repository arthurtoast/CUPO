"use server";

import { refresh } from "next/cache";
import { BUCKET_LOGOS, rutaLogo, validarLogo, validarMarca, type CampoMarca } from "@/lib/marca";
import {
  BUCKET_PORTADAS,
  rutaPortada,
  validarPersonalizacion,
  validarPortada,
  type CampoPersonalizacion,
} from "@/lib/personalizacion";
import { createClient } from "@/lib/supabase/server";

export type EstadoMarca = {
  guardado?: boolean;
  error?: string;
  errores?: Partial<Record<CampoMarca | CampoPersonalizacion, string>>;
};

export type EstadoLogo = {
  guardado?: boolean;
  quitado?: boolean;
  error?: string;
};

async function negocioDeLaSesion() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, negocioId: data?.claims?.sub ?? null };
}

// HU-06, HU-07 y HU-16: color, descripción, teléfono, dirección, bienvenida y
// redes. RLS limita el update a la fila del propio negocio y los CHECK de la
// tabla vuelven a validar.
export async function guardarMarca(
  _anterior: EstadoMarca,
  formData: FormData,
): Promise<EstadoMarca> {
  const validacion = validarMarca({
    color: formData.get("color"),
    descripcion: formData.get("descripcion"),
    telefono: formData.get("telefono"),
    direccion: formData.get("direccion"),
  });
  const personalizacion = validarPersonalizacion({
    bienvenida: formData.get("bienvenida"),
    instagram: formData.get("instagram"),
    facebook: formData.get("facebook"),
    whatsapp: formData.get("whatsapp"),
  });
  if (!validacion.ok || !personalizacion.ok) {
    return {
      error: "Revisa los campos marcados.",
      errores: {
        ...(validacion.ok ? {} : validacion.errores),
        ...(personalizacion.ok ? {} : personalizacion.errores),
      },
    };
  }

  const { supabase, negocioId } = await negocioDeLaSesion();
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const d = validacion.datos;
  const p = personalizacion.datos;
  const { error } = await supabase
    .from("negocio")
    .update({
      color_acento: d.color,
      descripcion: d.descripcion,
      telefono_publico: d.telefono,
      direccion: d.direccion,
      bienvenida: p.bienvenida,
      instagram: p.instagram,
      facebook: p.facebook,
      whatsapp: p.whatsapp,
    })
    .eq("id", negocioId);
  if (error) {
    console.error("No se pudo guardar la marca", error);
    return { error: "No pudimos guardar tus datos. Intenta de nuevo." };
  }

  refresh();
  return { guardado: true };
}

// Borra de la carpeta del negocio todo lo que no sea la imagen vigente. Si falla
// solo queda un archivo de más: no rompe la página.
async function limpiarAnteriores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  negocioId: string,
  conservar: string | null,
) {
  const { data: archivos, error } = await supabase.storage.from(bucket).list(negocioId);
  if (error || !archivos) return;
  const sobrantes = archivos
    .map((a) => `${negocioId}/${a.name}`)
    .filter((ruta) => ruta !== conservar);
  if (sobrantes.length > 0) {
    const { error: errorBorrar } = await supabase.storage.from(bucket).remove(sobrantes);
    if (errorBorrar) console.error(`No se pudieron borrar archivos anteriores de ${bucket}`, errorBorrar);
  }
}

// HU-06: sube el logo a logos/<negocio.id>/ y guarda su URL pública. Las
// políticas de Storage impiden escribir en la carpeta de otro negocio, y el
// bucket vuelve a revisar tipo y tamaño.
export async function subirLogo(_anterior: EstadoLogo, formData: FormData): Promise<EstadoLogo> {
  const archivo = formData.get("logo");
  const validacion = validarLogo(archivo instanceof File ? archivo : null);
  if (!validacion.ok) return { error: validacion.error };

  const { supabase, negocioId } = await negocioDeLaSesion();
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const ruta = rutaLogo(negocioId, validacion.extension, Date.now());
  const { error: errorSubir } = await supabase.storage
    .from(BUCKET_LOGOS)
    .upload(ruta, archivo as File, { contentType: validacion.tipo, upsert: false, cacheControl: "31536000" });
  if (errorSubir) {
    console.error("No se pudo subir el logo", errorSubir);
    return { error: "No pudimos subir tu logo. Intenta de nuevo." };
  }

  const { data: publica } = supabase.storage.from(BUCKET_LOGOS).getPublicUrl(ruta);
  const { error } = await supabase.from("negocio").update({ logo_url: publica.publicUrl }).eq("id", negocioId);
  if (error) {
    console.error("No se pudo guardar la URL del logo", error);
    await supabase.storage.from(BUCKET_LOGOS).remove([ruta]);
    return { error: "No pudimos guardar tu logo. Intenta de nuevo." };
  }

  await limpiarAnteriores(supabase, BUCKET_LOGOS, negocioId, ruta);
  refresh();
  return { guardado: true };
}

// Quita el logo: la página vuelve a mostrar las iniciales del negocio.
export async function quitarLogo(): Promise<EstadoLogo> {
  const { supabase, negocioId } = await negocioDeLaSesion();
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const { error } = await supabase.from("negocio").update({ logo_url: null }).eq("id", negocioId);
  if (error) {
    console.error("No se pudo quitar el logo", error);
    return { error: "No pudimos quitar tu logo. Intenta de nuevo." };
  }

  await limpiarAnteriores(supabase, BUCKET_LOGOS, negocioId, null);
  refresh();
  return { quitado: true };
}

// HU-16: sube la portada a portadas/<negocio.id>/ y guarda su URL pública. Igual
// que el logo: las políticas de Storage impiden escribir en la carpeta de otro
// negocio y el bucket vuelve a revisar tipo y tamaño.
export async function subirPortada(_anterior: EstadoLogo, formData: FormData): Promise<EstadoLogo> {
  const archivo = formData.get("portada");
  const validacion = validarPortada(archivo instanceof File ? archivo : null);
  if (!validacion.ok) return { error: validacion.error };

  const { supabase, negocioId } = await negocioDeLaSesion();
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const ruta = rutaPortada(negocioId, validacion.extension, Date.now());
  const { error: errorSubir } = await supabase.storage
    .from(BUCKET_PORTADAS)
    .upload(ruta, archivo as File, { contentType: validacion.tipo, upsert: false, cacheControl: "31536000" });
  if (errorSubir) {
    console.error("No se pudo subir la portada", errorSubir);
    return { error: "No pudimos subir tu portada. Intenta de nuevo." };
  }

  const { data: publica } = supabase.storage.from(BUCKET_PORTADAS).getPublicUrl(ruta);
  const { error } = await supabase.from("negocio").update({ portada_url: publica.publicUrl }).eq("id", negocioId);
  if (error) {
    console.error("No se pudo guardar la URL de la portada", error);
    await supabase.storage.from(BUCKET_PORTADAS).remove([ruta]);
    return { error: "No pudimos guardar tu portada. Intenta de nuevo." };
  }

  await limpiarAnteriores(supabase, BUCKET_PORTADAS, negocioId, ruta);
  refresh();
  return { guardado: true };
}

// Quita la portada: la página vuelve a empezar con el encabezado.
export async function quitarPortada(): Promise<EstadoLogo> {
  const { supabase, negocioId } = await negocioDeLaSesion();
  if (!negocioId) return { error: "Tu sesión expiró. Vuelve a entrar." };

  const { error } = await supabase.from("negocio").update({ portada_url: null }).eq("id", negocioId);
  if (error) {
    console.error("No se pudo quitar la portada", error);
    return { error: "No pudimos quitar tu portada. Intenta de nuevo." };
  }

  await limpiarAnteriores(supabase, BUCKET_PORTADAS, negocioId, null);
  refresh();
  return { quitado: true };
}
