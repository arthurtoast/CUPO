-- Pruebas de HU-13: cita_por_token y cancelar_por_token.
-- Las llamadas se hacen como visitante sin sesión (rol anon), igual que la página
-- /cancelar/<token>. Las fechas se calculan a partir de hoy para que nunca caduquen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

select has_function('public', 'cita_por_token', array['text'], 'existe cita_por_token');
select has_function('public', 'cancelar_por_token', array['text'], 'existe cancelar_por_token');
select is_definer('public', 'cita_por_token', array['text'], 'cita_por_token es security definer');
select is_definer('public', 'cancelar_por_token', array['text'], 'cancelar_por_token es security definer');

-- Negocio de prueba con un servicio de 45 min, de lunes a viernes 09:00-14:00
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'cancela@cupo.test');
insert into negocio (id, nombre, slug, telefono_publico)
values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'Cancela', 'negocio-cancela', '81 5555 0000');
insert into servicio (id, negocio_id, nombre, duracion_min)
values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'Corte', 45);
insert into horario_atencion (negocio_id, dia_semana, hora_inicio, hora_fin)
select 'aaaaaaaa-0000-4000-8000-0000000000d1', d, '09:00', '14:00' from generate_series(1, 5) d;

-- Tokens conocidos para las pruebas (64 hexadecimales, como los reales)
create temp table t on commit drop as
select repeat('a', 64) as futura, repeat('b', 64) as pasada, repeat('c', 64) as cancelada,
       repeat('d', 64) as inexistente,
       ((((now() at time zone 'America/Monterrey')::date
          + ((8 - extract(isodow from (now() at time zone 'America/Monterrey')::date)::int) % 7) + 7)
         + time '09:45') at time zone 'America/Monterrey') as lunes_0945;
grant select on t to anon;

insert into cita (negocio_id, servicio_id, inicio, fin, nombre_cliente, correo_cliente,
                  telefono_cliente, token_cancelacion)
select 'aaaaaaaa-0000-4000-8000-0000000000d1'::uuid, 'bbbbbbbb-0000-4000-8000-0000000000d1'::uuid,
       lunes_0945, lunes_0945 + interval '45 minutes', 'Ana Ruiz', 'ana@correo.test', '8111111111', futura
from t
union all
select 'aaaaaaaa-0000-4000-8000-0000000000d1'::uuid, 'bbbbbbbb-0000-4000-8000-0000000000d1'::uuid,
       now() - interval '2 hours', now() - interval '75 minutes', 'Beto', 'beto@correo.test', '8122222222', pasada
from t;
insert into cita (negocio_id, servicio_id, inicio, fin, nombre_cliente, correo_cliente,
                  telefono_cliente, token_cancelacion, estado, cancelada_en)
select 'aaaaaaaa-0000-4000-8000-0000000000d1'::uuid, 'bbbbbbbb-0000-4000-8000-0000000000d1'::uuid,
       lunes_0945 + interval '1 day', lunes_0945 + interval '1 day 45 minutes',
       'Carla', 'carla@correo.test', '8133333333', cancelada, 'cancelada', now()
from t;

-- ---------------------------------------------------------------- como visitante
set local role anon;

-- cita_por_token
select is((select negocio_nombre from t, cita_por_token(t.futura)), 'Cancela',
          'cita_por_token regresa el negocio de la cita');
select is((select estado from t, cita_por_token(t.futura)), 'confirmada',
          'cita_por_token regresa el estado');
select is((select servicio_nombre from t, cita_por_token(t.futura)), 'Corte',
          'cita_por_token regresa el servicio');
select is((select count(*)::int from t, cita_por_token(t.inexistente)), 0,
          'un token que no existe no regresa nada');
select is((select count(*)::int from cita_por_token('no-es-un-token')), 0,
          'un texto sin formato de token no regresa nada');
select is((select count(*)::int from cita_por_token(null)), 0,
          'un token nulo no regresa nada');
select is((select count(*)::int from cita_por_token(upper(repeat('a', 64)))), 0,
          'el token distingue mayúsculas (los reales son minúsculas)');
select ok((select not (proargnames && array['correo_cliente', 'telefono_cliente', 'token_cancelacion'])
            from pg_catalog.pg_proc
            where oid = 'public.cita_por_token(text)'::regprocedure),
          'cita_por_token no expone correo, teléfono ni token');

-- cancelar_por_token: errores
select throws_ok($$ select * from cancelar_por_token('no-es-un-token') $$,
                 'P0001', 'token_invalido', 'un texto sin formato de token se rechaza');
select throws_ok($$ select * from t, cancelar_por_token(t.inexistente) $$,
                 'P0001', 'token_invalido', 'un token que no existe se rechaza');
select throws_ok($$ select * from cancelar_por_token(null) $$,
                 'P0001', 'token_invalido', 'un token nulo se rechaza');
select throws_ok($$ select * from t, cancelar_por_token(t.cancelada) $$,
                 'P0001', 'cita_ya_cancelada', 'una cita ya cancelada no cambia');
select throws_ok($$ select * from t, cancelar_por_token(t.pasada) $$,
                 'P0001', 'cita_pasada', 'una cita que ya pasó no se cancela');

-- Antes de cancelar, el hueco aparece ocupado
select is((select count(*)::int from t, vista_ocupado v
            where v.negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000d1' and v.inicio = t.lunes_0945), 1,
          'antes de cancelar, el hueco aparece ocupado');

-- cancelar_por_token: caso válido
select is((select estado from t, cancelar_por_token(t.futura)), 'cancelada',
          'una cita confirmada y futura se cancela con su token');
select throws_ok($$ select * from t, cancelar_por_token(t.futura) $$,
                 'P0001', 'cita_ya_cancelada', 'cancelar dos veces no hace nada la segunda vez');
select is((select estado from t, cita_por_token(t.futura)), 'cancelada',
          'cita_por_token ya la muestra cancelada');

-- El horario queda libre: desaparece de vista_ocupado y se puede volver a reservar
select is((select count(*)::int from t, vista_ocupado v
            where v.negocio_id = 'aaaaaaaa-0000-4000-8000-0000000000d1' and v.inicio = t.lunes_0945), 0,
          'después de cancelar, el hueco ya no aparece ocupado');
select is((select count(*)::int from t, reservar_cita('negocio-cancela', t.lunes_0945,
                                                      'Diego', 'diego@correo.test', '8144444444')), 1,
          'el mismo hueco se puede volver a reservar');

select throws_ok($$ select * from cita $$, '42501', null,
                 'el visitante sigue sin poder leer la tabla cita');

-- ---------------------------------------------------------------- verificación
reset role;

select ok((select cancelada_en is not null and estado = 'cancelada' from cita, t
            where token_cancelacion = t.futura),
          'la cita no se borra: queda cancelada con fecha de cancelación');

select * from finish();
rollback;
