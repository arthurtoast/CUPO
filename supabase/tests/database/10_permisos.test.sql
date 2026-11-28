-- T-18 · Permisos de tabla explícitos. Supabase ya no los da en proyectos
-- nuevos (30-may-2026): si una migración los quita o se olvida de darlos, la
-- app falla en producción aunque en local funcione. Estas pruebas los fijan.
begin;                                                                           -- aporta: todo se deshace al final
create extension if not exists pgtap with schema extensions;                     -- aporta: funciones de prueba
set local search_path = public, extensions;                                      -- aporta: nombres cortos

select plan(17);                                                                 -- aporta: cuántas pruebas deben correr

-- ---------------------------------------------------------------- dueño (authenticated)
select table_privs_are('public', 'negocio', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                       'el dueño puede registrar y editar su negocio');           -- aporta: el registro inserta aquí
select table_privs_are('public', 'horario_atencion', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                       'el dueño edita su horario');                             -- aporta: pantalla Disponibilidad
select table_privs_are('public', 'servicio', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                       'el dueño edita su servicio');                            -- aporta: pantalla Disponibilidad
select table_privs_are('public', 'bloqueo', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                       'el dueño crea y quita bloqueos');                        -- aporta: pantalla Bloqueos
select table_privs_are('public', 'cita', 'authenticated', array['SELECT'],
                       'el dueño solo lee la tabla cita completa');              -- aporta: nunca crea ni borra citas
select column_privs_are('public', 'cita', 'estado', 'authenticated', array['SELECT', 'UPDATE'],
                        'el dueño puede cambiar el estado de la cita');          -- aporta: cancelar (HU-15)
select column_privs_are('public', 'cita', 'correo_cliente', 'authenticated', array['SELECT'],
                        'el dueño no puede editar los datos del cliente');       -- aporta: datos del cliente intactos
select table_privs_are('public', 'staff', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
                       'el dueño agrega y desactiva staff, sin borrar');         -- aporta: pantalla Equipo

-- ---------------------------------------------------------------- visitante (anon)
select table_privs_are('public', 'negocio', 'anon', array[]::text[], 'el visitante no toca la tabla negocio');   -- aporta: solo vistas
select table_privs_are('public', 'cita', 'anon', array[]::text[], 'el visitante no toca la tabla cita');         -- aporta: reserva solo por función
select table_privs_are('public', 'staff', 'anon', array[]::text[], 'el visitante no toca la tabla staff');       -- aporta: solo vista_staff
select table_privs_are('public', 'vista_marca', 'anon', array['SELECT'], 'el visitante lee la marca');          -- aporta: página pública
select table_privs_are('public', 'vista_ocupado', 'anon', array['SELECT'], 'el visitante lee los ocupados');    -- aporta: horarios libres
select table_privs_are('public', 'vista_staff', 'anon', array['SELECT'], 'el visitante lee el staff activo');   -- aporta: selector "¿Con quién?"

-- ---------------------------------------------------------------- servidor (service_role)
select table_privs_are('public', 'negocio', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                       'la llave secreta lee el negocio para avisar al dueño'); -- aporta: lib/supabase/admin.ts

-- ---------------------------------------------------------------- de punta a punta
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1","role":"authenticated"}'; -- aporta: sesión de un dueño nuevo
reset role;                                                                      -- aporta: postgres crea el usuario de Auth
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'nuevo@cupo.test'); -- aporta: como lo deja signUp
set local role authenticated;                                                    -- aporta: igual que la app tras registrarse
select lives_ok($$ insert into negocio (id, nombre, slug) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'Nuevo', 'negocio-nuevo') $$,
                'un dueño recién registrado puede crear su negocio');            -- aporta: el paso que fallaba en producción
select is((select count(*)::int from negocio), 1, 'y lo ve (RLS: solo el suyo)');   -- aporta: permiso y política juntos

reset role;                                                                      -- aporta: postgres para el cierre
select * from finish();                                                          -- aporta: compara corridas contra el plan
rollback;                                                                        -- aporta: no deja nada
