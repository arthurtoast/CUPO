-- HU-15 · Cancelación por el negocio
--
-- El negocio cancela una cita desde su agenda y el cliente recibe un correo.
--
--   cancelar_cita_negocio(cita_id)  la pasa a cancelada y regresa lo necesario
--                                   para el correo de aviso al cliente
--
-- Corre como quien llama (security invoker), así que RLS aplica: el negocio solo
-- encuentra sus propias citas (políticas cita_ver_mi_agenda y
-- cita_cancelar_de_mi_agenda de T-04). Una cita de otro negocio se reporta igual
-- que una que no existe.
--
-- Errores (el mensaje es un código estable, SQLSTATE P0001), igual que HU-13:
--
--   sin_sesion          no hay usuario autenticado
--   cita_no_encontrada  no existe o es de otro negocio
--   cita_ya_cancelada   ya estaba cancelada; no cambia nada
--   cita_pasada         ya empezó o ya pasó; no se cancela
--
-- Como en HU-13, la cita no se borra (regla de integridad 4): cambia estado y el
-- trigger cita_transicion_estado llena cancelada_en. El horario se libera solo
-- porque cita_sin_traslape y vista_ocupado solo cuentan las confirmadas.

create or replace function public.cancelar_cita_negocio(p_cita_id uuid)
returns table (
  cita_id           uuid,
  inicio            timestamptz,
  fin               timestamptz,
  cancelada_en      timestamptz,
  nombre_cliente    text,
  correo_cliente    text,
  servicio_nombre   text,
  duracion_min      integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio uuid := (select auth.uid());
  v_cita    public.cita%rowtype;
begin
  if v_negocio is null then
    raise exception 'sin_sesion' using errcode = 'P0001';
  end if;

  -- "for update": si el negocio da dos clics, o el cliente cancela con su enlace
  -- al mismo tiempo, la segunda operación espera y ve la cita ya cancelada.
  select * into v_cita
  from public.cita c
  where c.id = p_cita_id
    and c.negocio_id = v_negocio
  for update;

  if not found then
    raise exception 'cita_no_encontrada' using errcode = 'P0001';
  end if;
  if v_cita.estado = 'cancelada' then
    raise exception 'cita_ya_cancelada' using errcode = 'P0001';
  end if;
  if v_cita.inicio <= pg_catalog.now() then
    raise exception 'cita_pasada' using errcode = 'P0001',
      hint = 'La cita ya empezó o ya pasó; no se cancela desde la agenda.';
  end if;

  update public.cita c
     set estado = 'cancelada'
   where c.id = v_cita.id
  returning * into v_cita;

  return query
    select v_cita.id, v_cita.inicio, v_cita.fin, v_cita.cancelada_en,
           v_cita.nombre_cliente, v_cita.correo_cliente, s.nombre,
           (extract(epoch from (v_cita.fin - v_cita.inicio)) / 60)::integer
    from public.servicio s
    where s.id = v_cita.servicio_id;
end;
$$;

comment on function public.cancelar_cita_negocio(uuid) is
  'El negocio cancela una cita suya. Errores: sin_sesion, cita_no_encontrada, cita_ya_cancelada, cita_pasada.';

-- Solo el negocio con sesión; el visitante cancela con su token (HU-13).
revoke execute on function public.cancelar_cita_negocio(uuid) from public, anon;
grant  execute on function public.cancelar_cita_negocio(uuid) to authenticated;
