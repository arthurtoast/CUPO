-- T-18 · Permisos de tabla explícitos
--
-- Desde el 30 de mayo de 2026, los proyectos nuevos de Supabase ya no dan
-- permisos automáticos sobre las tablas del esquema public a los roles de la
-- API (anon, authenticated, service_role). Las migraciones anteriores
-- confiaban en esos permisos: en local (y en proyectos viejos) funcionaba,
-- pero en el proyecto de producción el dueño recibía "permission denied for
-- table negocio" (42501) al registrarse, y el registro fallaba.
--
-- Aquí se dan, tabla por tabla, exactamente los permisos que la app usa. Las
-- reglas de qué filas ve cada quien siguen siendo las políticas RLS de
-- 20261008000200_t04_rls_vistas.sql; un permiso de tabla sin política no
-- deja ver nada.
--
-- Es idempotente: en una base que ya tenía los permisos automáticos no cambia
-- nada, salvo quitar los que la app nunca usa (truncate, references, trigger).
--
-- Cambio de Supabase: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

-- ---------------------------------------------------------------------------
-- 1. El dueño del negocio (authenticated): sus datos de configuración
-- ---------------------------------------------------------------------------
revoke all on table public.negocio, public.horario_atencion, public.servicio,          -- aporta: parte de cero, igual en local y en la nube
                    public.bloqueo
  from authenticated;
grant select, insert, update, delete                                                    -- aporta: lo que hace el panel (registro, horario, servicio, marca, bloqueos)
  on table public.negocio, public.horario_atencion, public.servicio, public.bloqueo
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Citas: el dueño las lee y solo cambia estado y cancelada_en (HU-15)
-- ---------------------------------------------------------------------------
revoke all on table public.cita from authenticated;                                     -- aporta: nunca crea, borra ni edita datos del cliente
grant select on table public.cita to authenticated;                                     -- aporta: la agenda lee sus citas (RLS limita a las suyas)
grant update (estado, cancelada_en) on table public.cita to authenticated;              -- aporta: cancelar; mismo permiso que t04

-- ---------------------------------------------------------------------------
-- 3. Staff (HU-18): ya tenía sus permisos explícitos; se repiten para que este
--    archivo diga completo qué puede el dueño
-- ---------------------------------------------------------------------------
revoke all on table public.staff from authenticated;                                    -- aporta: parte de cero
grant select, insert, update on table public.staff to authenticated;                    -- aporta: alta, baja lógica y lectura; nunca borrar

-- ---------------------------------------------------------------------------
-- 4. El visitante sin sesión (anon): ninguna tabla
-- ---------------------------------------------------------------------------
revoke all on table public.negocio, public.horario_atencion, public.servicio,           -- aporta: solo vistas públicas y funciones
                    public.bloqueo, public.cita, public.staff
  from anon;

-- ---------------------------------------------------------------------------
-- 5. La llave secreta (service_role): solo la usa el servidor
-- ---------------------------------------------------------------------------
-- La app la usa para leer el correo del dueño y avisarle de cada cita
-- (app/[slug]/notificar.ts). service_role ignora RLS, por eso su llave nunca
-- va en una variable NEXT_PUBLIC_.
revoke all on table public.negocio, public.horario_atencion, public.servicio,           -- aporta: parte de cero, igual en local y en la nube
                    public.bloqueo, public.cita, public.staff
  from service_role;
grant select, insert, update, delete                                                    -- aporta: acceso de servidor, como antes del cambio
  on table public.negocio, public.horario_atencion, public.servicio,
           public.bloqueo, public.cita, public.staff
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Vistas públicas: ya tenían permisos explícitos (t04, hu18); se repiten
-- ---------------------------------------------------------------------------
grant select on table public.vista_marca, public.vista_servicio, public.vista_horario,  -- aporta: la página pública de reserva
                      public.vista_ocupado, public.vista_staff
  to anon, authenticated, service_role;
