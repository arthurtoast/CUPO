import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase en cada petición y reescribe las cookies
// en la respuesta. Los Server Components no pueden escribir cookies, por eso
// el refresco vive aquí y no en lib/supabase/server.ts.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No pongas código entre createServerClient y getClaims: getClaims valida
  // el token y, si ya venció, lo refresca y dispara setAll.
  const { data } = await supabase.auth.getClaims();
  const usuario = data?.claims;

  const ruta = request.nextUrl.pathname;

  // Redirección optimista; el layout de /panel vuelve a verificar la sesión.
  if (!usuario && ruta.startsWith("/panel")) {
    return redirigir(request, supabaseResponse, "/entrar");
  }
  // Con sesión no tiene caso volver a registrarse o a entrar.
  if (usuario && (ruta === "/entrar" || ruta === "/registro")) {
    return redirigir(request, supabaseResponse, "/panel");
  }

  return supabaseResponse;
}

// Copia las cookies refrescadas a la redirección para no perder la sesión.
function redirigir(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redireccion = NextResponse.redirect(url);
  supabaseResponse.cookies
    .getAll()
    .forEach((cookie) => redireccion.cookies.set(cookie));
  return redireccion;
}
