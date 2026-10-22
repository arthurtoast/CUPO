# Base de datos

Esquema de Cupo en PostgreSQL (Supabase). Todo vive en `supabase/` y se aplica igual en local y en producción.

```
supabase/
├── migrations/
│   ├── 20261008000100_t03_esquema.sql              tablas y reglas de integridad
│   ├── 20261008000200_t04_rls_vistas.sql           Row Level Security y vistas públicas
│   └── 20261008000300_t05_traslape_reservar_cita.sql   exclusión sin traslape y reservar_cita
├── seed.sql                                        negocio de prueba (solo local)
└── tests/database/*.test.sql                       pruebas pgTAP
```

## Uso en local

Requiere Docker Desktop y Supabase CLI, con el proyecto ya inicializado (`supabase/config.toml`).

```bash
supabase start        # levanta Postgres, Auth, Storage y el buzón de correo de prueba
supabase db reset     # borra la base local, aplica las migraciones en orden y corre seed.sql
supabase test db      # corre las pruebas de supabase/tests
```

La semilla crea **Estética Lupita** (`/estetica-lupita`), con el horario y la marca de los wireframes, un servicio de 45 minutos, dos citas, una cancelada y un bloqueo. Las fechas se calculan a partir del día en que se corre, así que nunca caducan. Usuario del dueño en local: `lupita@cupo.test` / `cupo-local-123`.

## Tablas

| Tabla | Para qué | Notas |
| --- | --- | --- |
| `negocio` | Marca y datos públicos del negocio | `id` = id del usuario en `auth.users`; sin contraseñas |
| `horario_atencion` | Bloques de atención por día | `dia_semana` ISO: 1 = lunes … 7 = domingo; horas locales del negocio; la comida se modela partiendo el día |
| `servicio` | Duración de la cita | En el MVP, uno activo por negocio |
| `bloqueo` | Vacaciones o tardes ocupadas | El `motivo` nunca se muestra al cliente |
| `cita` | Reservas | Copia de nombre, correo y teléfono (el cliente no tiene cuenta); `estado` confirmada o cancelada |

Fechas y horas absolutas en `timestamptz` (UTC). La interfaz las muestra con `negocio.zona_horaria`.

## Quién puede qué

| Identidad | Rol de Postgres | Puede |
| --- | --- | --- |
| Visitante sin sesión | `anon` | Leer las vistas públicas y ejecutar `reservar_cita`. Ninguna tabla. |
| Dueño del negocio | `authenticated` | Leer y editar sus filas de `negocio`, `horario_atencion`, `servicio`, `bloqueo`. En `cita`: leer y cancelar (`estado`), nunca crear, borrar ni cambiar datos del cliente. |

### Vistas públicas (para la página de reserva)

| Vista | Columnas |
| --- | --- |
| `vista_marca` | `id, slug, nombre, descripcion, logo_url, color_acento, telefono_publico, direccion, zona_horaria` |
| `vista_servicio` | `id, negocio_id, nombre, duracion_min, creado_en` (solo activos) |
| `vista_horario` | `negocio_id, dia_semana, hora_inicio, hora_fin` |
| `vista_ocupado` | `negocio_id, inicio, fin` de citas confirmadas y bloqueos que aún no terminan |

Huecos libres = bloques de `vista_horario` divididos cada `duracion_min` desde `hora_inicio`, menos los que se enciman con `vista_ocupado`, menos los que ya pasaron.

## `reservar_cita`

```sql
select * from reservar_cita(
  p_slug        => 'estetica-lupita',
  p_inicio      => '2026-10-13 10:30-06',
  p_nombre      => 'Ana Ruiz',
  p_correo      => 'ana@correo.com',
  p_telefono    => '81 1234 5678',   -- se guarda solo con dígitos
  p_servicio_id => null              -- opcional: null usa el servicio activo más antiguo
);
-- devuelve: cita_id, token_cancelacion, inicio, fin
```

Desde la app: `supabase.rpc('reservar_cita', { p_slug, p_inicio, p_nombre, p_correo, p_telefono })`.

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
| `horario_ocupado` | 23P01 | Otra persona tomó ese hueco: pedir que elija otro |

## Reglas de integridad

1. **Sin traslape de citas:** restricción de exclusión `cita_sin_traslape` sobre `tstzrange(inicio, fin, '[)')` para citas confirmadas. Una cita que termina a las 10:45 no choca con otra que empieza a las 10:45.
2. **Todo en UTC:** `timestamptz` en la base; la zona horaria del negocio solo se usa para mostrar y para validar el horario.
3. **Token impredecible:** 32 bytes aleatorios de `gen_random_bytes`, en hexadecimal.
4. **Borrado lógico:** cancelar cambia `estado` y llena `cancelada_en`; una cita cancelada no se puede reactivar.
5. **Row Level Security** en las cinco tablas.
