// HU-12: correos de una cita nueva. Se llama con after() desde la acción de
// reservar, así el cliente ve su confirmación sin esperar al servidor de correo.
// Solo se importa desde el servidor.

import { avisoParaNegocio, correoParaCliente, type Correo, type DatosCita } from "@/lib/correos";
import { enviarCorreos } from "@/lib/enviar-correo";
import { correoDelNegocio, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CitaNueva = {
  slug: string;
  servicioId: string | null;
  inicio: string;
  cliente: { nombre: string; correo: string; telefono: string };
  enlaceCancelar: string;
  enlaceAgenda: string;
};

export async function notificarCitaNueva(cita: CitaNueva): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: marca, error: errorMarca } = await supabase
      .from("vista_marca")
      .select("id, nombre, telefono_publico, direccion, zona_horaria")
      .eq("slug", cita.slug)
      .maybeSingle();
    if (errorMarca || !marca) throw new Error(`negocio: ${errorMarca?.message ?? "no encontrado"}`);

    // El mismo servicio que usó reservar_cita: el que mandó la página o, si no,
    // el activo más antiguo.
    let consulta = supabase
      .from("vista_servicio")
      .select("nombre, duracion_min")
      .eq("negocio_id", marca.id);
    consulta = cita.servicioId
      ? consulta.eq("id", cita.servicioId)
      : consulta.order("creado_en", { ascending: true }).order("id", { ascending: true });
    const { data: servicio, error: errorServicio } = await consulta.limit(1).maybeSingle();
    if (errorServicio || !servicio) {
      throw new Error(`servicio: ${errorServicio?.message ?? "no encontrado"}`);
    }

    const datos: DatosCita = {
      negocio: {
        nombre: marca.nombre,
        telefono: marca.telefono_publico,
        direccion: marca.direccion,
        zonaHoraria: marca.zona_horaria,
      },
      servicio: { nombre: servicio.nombre, duracionMin: servicio.duracion_min },
      cliente: cita.cliente,
      inicio: cita.inicio,
      enlaceCancelar: cita.enlaceCancelar,
      enlaceAgenda: cita.enlaceAgenda,
    };

    // El correo del dueño no está en las vistas públicas: se lee con la llave
    // secreta. Sin ella, el cliente recibe su correo y el aviso se omite.
    let correoNegocio: string | null = null;
    const admin = createAdminClient();
    if (admin) {
      try {
        correoNegocio = await correoDelNegocio(admin, marca.id);
      } catch (e) {
        console.error("No se pudo obtener el correo del negocio:", e instanceof Error ? e.message : e);
      }
    } else {
      console.warn("Aviso al negocio omitido: falta SUPABASE_SECRET_KEY (ver .env.example)");
    }

    const correos: Correo[] = [correoParaCliente(datos, correoNegocio)];
    if (correoNegocio) correos.push(avisoParaNegocio(datos, correoNegocio));

    await enviarCorreos(correos);
  } catch (e) {
    console.error("No se pudieron preparar los correos de la cita:", e instanceof Error ? e.message : e);
  }
}
