import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Crea un cliente por petición: no lo guardes en una variable global.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Los Server Components no pueden escribir cookies. Se ignora
            // porque el refresco de sesión lo hará el proxy/middleware.
          }
        },
      },
    },
  );
}
