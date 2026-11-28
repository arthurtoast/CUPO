# Base de datos

Esquema de Cupo en PostgreSQL (Supabase). Todo vive en `supabase/` y se aplica igual en local y en producción.

```
supabase/
├── migrations/
│   ├── 20261008000100_t03_esquema.sql              tablas y reglas de integridad
│   ├── 20261008000200_t04_rls_vistas.sql           Row Level Security y vistas públicas
│   ├── 20261008000300_t05_traslape_reservar_cita.sql   exclusión sin traslape y reservar_cita
│   ├── 20261028000100_hu13_cancelar_por_token.sql      cita_por_token y cancelar_por_token
│   ├── 20261031000100_hu05_bloqueos.sql                columna serie y crear_bloqueos
│   ├── 20261107000100_hu06_logos.sql                   buckets de logos y portadas
│   ├── 20261107000200_hu15_cancelar_por_negocio.sql    cancelar_cita_negocio
│   ├── 20261121000100_hu16_personalizacion.sql         portada, bienvenida y redes
│   ├── 20261126000100_hu18_staff.sql                   tabla staff y agenda por persona
│   ├── 20261127000100_t18_permisos_explicitos.sql      permisos de tabla explícitos (producción)
│   └── 20261128000100_registro_atomico.sql             el negocio nace con el usuario (trigger en auth.users)
├── seed.sql                                        negocio de prueba (solo local)
├── tests/database/*.test.sql                       pruebas pgTAP
└── tests/concurrencia.sh                           N reservas simultáneas del mismo hueco
```

## Uso en local

Requiere Docker Desktop y Supabase CLI, con el proyecto ya inicializado (`supabase/config.toml`).

```bash
supabase start        # levanta Postgres, Auth, Storage y el buzón de correo de prueba
supabase db reset     # borra la base local, aplica las migraciones en orden y corre seed.sql
supabase test db      # corre las pruebas de supabase/tests
npm run test:concurrencia               # 20 reservas al mismo tiempo: debe ganar una
npm run test:concurrencia -- --n 50     # más reservas; --help para ver opciones
npm test              # pruebas unitarias del cálculo de huecos y la validación (sin base)
```

La semilla crea **Estética Lupita** (`/estetica-lupita`), con el horario y la marca de los wireframes, un servicio de 45 minutos, dos citas, una cancelada y un bloqueo. Las fechas se calculan a partir del día en que se corre, así que nunca caducan. Usuario del dueño en local: `lupita@cupo.test` / `cupo-local-123`.

## Tablas

| Tabla | Para qué | Notas |
| --- | --- | --- |
| `negocio` | Marca y datos públicos del negocio | `id` = id del usuario en `auth.users`; sin contraseñas |
| `horario_atencion` | Bloques de atención por día | `dia_semana` ISO: 1 = lunes … 7 = domingo; horas locales del negocio; la comida se modela partiendo el día |
| `servicio` | Duración de la cita | En el MVP, uno activo por negocio |
| `bloqueo` | Vacaciones o tardes ocupadas | El `motivo` nunca se muestra al cliente; `serie` agrupa los días de una franja diaria |
| `cita` | Reservas | Copia de nombre, correo y teléfono (el cliente no tiene cuenta); `estado` confirmada o cancelada; `staff_id` con quién es (NULL si el negocio no tiene staff) |
| `staff` | Personas que atienden (HU-18) | `nombre` de 1 a 60 caracteres; `activo`; no se borra, se desactiva |

Fechas y horas absolutas en `timestamptz` (UTC). La interfaz las muestra con `negocio.zona_horaria`.

## Quién puede qué

| Identidad | Rol de Postgres | Puede |
| --- | --- | --- |
| Visitante sin sesión | `anon` | Leer las vistas públicas y ejecutar `reservar_cita`, `cita_por_token` y `cancelar_por_token`. Ninguna tabla. |
| Dueño del negocio | `authenticated` | Leer y editar sus filas de `negocio`, `horario_atencion`, `servicio`, `bloqueo` y `staff` (en `staff`, sin borrar). En `cita`: leer y cancelar (`estado`), nunca crear, borrar ni cambiar datos del cliente. |

### Permisos de tabla explícitos (T-18)

Desde el 30 de mayo de 2026, Supabase ya no da permisos automáticos sobre las tablas de `public` en proyectos nuevos ([aviso oficial](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)). En local seguían llegando y todo funcionaba. En el proyecto de producción, el registro fallaba con `permission denied for table negocio` (42501) y la app mostraba "No pudimos crear tu negocio".

`20261127000100_t18_permisos_explicitos.sql` da, tabla por tabla, los permisos de la tabla de arriba, y quita los que la app no usa (`truncate`, `references`, `trigger`). Así la base queda igual en local y en la nube. `service_role` (la llave secreta, solo en el servidor) tiene `select, insert, update, delete` en las seis tablas.

`10_permisos.test.sql` fija los permisos con `table_privs_are` y `column_privs_are`, y prueba que un dueño recién registrado puede crear su negocio. **Regla para migraciones nuevas:** cada `create table` va con su `grant` explícito. Si no, en producción la tabla queda inaccesible aunque en local funcione.

### Vistas públicas (para la página de reserva)

| Vista | Columnas |
| --- | --- |
| `vista_marca` | `id, slug, nombre, descripcion, logo_url, color_acento, telefono_publico, direccion, zona_horaria, portada_url, bienvenida, instagram, facebook, whatsapp` (las últimas cinco desde HU-16) |
| `vista_servicio` | `id, negocio_id, nombre, duracion_min, creado_en` (solo activos) |
| `vista_horario` | `negocio_id, dia_semana, hora_inicio, hora_fin` |
| `vista_staff` | `id, negocio_id, nombre, creado_en` (solo activos, HU-18) |
| `vista_ocupado` | `negocio_id, inicio, fin, staff_id, bloqueo` de citas confirmadas y bloqueos que aún no terminan. Los bloqueos llevan `staff_id` NULL y `bloqueo` true |

Huecos libres = bloques de `vista_horario` divididos cada `duracion_min` desde `hora_inicio`, menos los que se enciman con `vista_ocupado` (con staff, solo las citas de esa persona y los bloqueos: `lib/staff.ts`), menos los que ya pasaron. La página pública lo calcula en `lib/huecos.ts` con estas mismas reglas.

## `reservar_cita`

```sql
select * from reservar_cita(
  p_slug        => 'estetica-lupita',
  p_inicio      => '2026-10-13 10:30-06',
  p_nombre      => 'Ana Ruiz',
  p_correo      => 'ana@correo.com',
  p_telefono    => '81 1234 5678',   -- se guarda solo con dígitos
  p_servicio_id => null,             -- opcional: null usa el servicio activo más antiguo
  p_staff_id    => null              -- HU-18: obligatorio si el negocio tiene staff activo; si no, se ignora
);
-- devuelve: cita_id, token_cancelacion, inicio, fin
```

Desde la app (`app/[slug]/actions.ts`): `supabase.rpc('reservar_cita', { p_slug, p_inicio, p_nombre, p_correo, p_telefono, p_servicio_id, p_staff_id })`. Los mensajes para el cliente están en `lib/reserva.ts`.

Si algo falla, el mensaje del error es uno de estos códigos, pensados para traducirse a un texto en la interfaz:

| Código | SQLSTATE | Significa |
| --- | --- | --- |
| `negocio_no_existe` | P0001 | El slug no existe |
| `servicio_invalido` | P0001 | El servicio no existe, es de otro negocio o está inactivo |
| `datos_invalidos` | P0001 | Nombre vacío, correo mal formado o teléfono sin 10 a 15 dígitos |
| `horario_pasado` | P0001 | El inicio ya pasó |
| `fuera_de_horario` | P0001 | No cae completo dentro de un bloque de atención |
| `horario_no_alineado` | P0001 | No coincide con la rejilla (09:00, 09:45, 10:30… con 45 min) |
| `horario_bloqueado` | P0001 | Se encima con un bloqueo |
| `staff_invalido` | P0001 | El negocio tiene staff y la persona falta, está inactiva o es de otro negocio (HU-18) |
| `horario_ocupado` | 23P01 | Otro cliente tomó ese hueco con la misma persona: pedir que elija otro |

## `cita_por_token` y `cancelar_por_token` (HU-13)

El enlace del correo de confirmación es `/cancelar/<token>`. El token (64 hexadecimales) es la única prueba de que la cita es de quien lo abre.

```sql
select * from cita_por_token('<token>');      -- resumen para mostrar; cero filas si no existe
select * from cancelar_por_token('<token>');  -- la pasa a cancelada; regresa cita_id, estado, inicio, cancelada_en
```

`cita_por_token` no regresa el correo ni el teléfono del cliente ni el token. Un token mal escrito y uno que no existe dan el mismo resultado (cero filas), para no dar pistas.

| Código | SQLSTATE | Significa |
| --- | --- | --- |
| `token_invalido` | P0001 | El token no tiene formato o no corresponde a ninguna cita |
| `cita_ya_cancelada` | P0001 | Ya estaba cancelada; no cambia nada |
| `cita_pasada` | P0001 | La cita ya empezó o ya pasó |

La cita no se borra: queda `cancelada` con `cancelada_en`, el negocio la ve tachada en su agenda y el horario se libera solo, porque `cita_sin_traslape` y `vista_ocupado` solo cuentan las confirmadas. Más detalle en `docs/cancelacion.md`.

## Registro atómico (trigger `cupo_negocio_al_registrar`)

El registro manda el nombre del negocio dentro del `signUp` (`options.data.nombre_negocio`). Un trigger `after insert` en `auth.users` llama a `cupo_crear_negocio_al_registrar()`, que crea la fila de `negocio` en la misma transacción. Si falla (por ejemplo, `nombre_invalido`), el `signUp` falla completo y no queda un usuario sin negocio. Los usuarios creados sin `nombre_negocio` (la semilla, el panel de Supabase, las pruebas) no reciben negocio automático. El slug sale de `cupo_slug_base(nombre)`; si choca o es una ruta reservada, se le agrega un sufijo de 4 caracteres. Detalle en `docs/registro.md`.

## `crear_bloqueos` (HU-05)

```sql
select * from crear_bloqueos('2026-11-02', '2026-11-06');                     -- días completos
select * from crear_bloqueos('2026-11-02', '2026-11-06', '14:00', '15:00');   -- franja diaria
-- devuelve: creados, serie, citas_afectadas
```

Corre con la sesión del dueño (no es security definer), así que RLS solo le deja escribir en su negocio. Las fechas y horas son locales del negocio; la conversión a UTC se hace en la función con `negocio.zona_horaria`. Las citas confirmadas que quedan dentro no se cancelan: `citas_afectadas` lo avisa. Errores (SQLSTATE P0001, el mensaje es el código): `sin_sesion`, `sin_negocio`, `rango_invalido`, `rango_muy_largo` (`hasta - desde > 365`), `fecha_pasada` (solo si `hasta` ya pasó), `horas_incompletas`, `horas_invalidas`, `motivo_largo` (más de 120 caracteres; vacío se guarda como NULL). Una franja de un solo día o un bloqueo de días completos no lleva `serie`. Contrato completo y formatos en `docs/bloqueos.md`.

## Reglas de integridad

1. **Sin traslape de citas:** restricción de exclusión `cita_sin_traslape` sobre `tstzrange(inicio, fin, '[)')` para citas confirmadas, por negocio y por persona (`coalesce(staff_id, uuid cero)`: las citas sin persona comparten un carril). Detalle en `docs/staff.md`. Una cita que termina a las 10:45 no choca con otra que empieza a las 10:45.
2. **Todo en UTC:** `timestamptz` en la base; la zona horaria del negocio solo se usa para mostrar y para validar el horario.
3. **Token impredecible:** 32 bytes aleatorios de `gen_random_bytes`, en hexadecimal.
4. **Borrado lógico:** cancelar cambia `estado` y llena `cancelada_en`; una cita cancelada no se puede reactivar.
5. **Row Level Security** en las seis tablas.
6. **Staff del mismo negocio:** la llave `cita_staff_del_negocio (staff_id, negocio_id)` impide ligar una cita a una persona de otro negocio.
