import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con la llave secreta: se salta RLS. Solo para el servidor y solo para
// lo que el visitante no debe poder leer, como el correo del dueño del negocio.
// Nunca lo importes desde un componente de cliente.
//
// SUPABASE_SECRET_KEY: en local sale de `npx supabase status -o env` (SECRET_KEY);
// en producción, en Project Settings → API Keys. Sin ella, regresa null y lo
// que dependa de ella se omite.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !llave) return null;
  return createClient(url, llave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Correo al que se avisa al negocio: el de contacto si lo configuró; si no,
// el de su cuenta (negocio.id es el id del usuario en auth.users).
export async function correoDelNegocio(
  admin: SupabaseClient,
  negocioId: string,
): Promise<string | null> {
  const { data: negocio, error } = await admin
    .from("negocio")
    .select("correo_contacto")
    .eq("id", negocioId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el negocio: ${error.message}`);
  if (negocio?.correo_contacto) return negocio.correo_contacto;

  const { data: usuario, error: errorUsuario } = await admin.auth.admin.getUserById(negocioId);
  if (errorUsuario) throw new Error(`No se pudo leer la cuenta del negocio: ${errorUsuario.message}`);
  return usuario.user?.email ?? null;
}
