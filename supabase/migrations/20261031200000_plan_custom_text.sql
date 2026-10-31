-- Texto livre do plano, escrito pelo super admin e exibido na oferta.
alter table public.plans
  add column custom_text text check (char_length(custom_text) <= 2000);

-- A retenção de auditoria nunca foi aplicada: o histórico fica disponível em todos os planos.
update public.plans set features = features - 'audit_retention_days';

drop function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, uuid);

create function public.admin_save_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_price_cents integer,
  p_extra_seat_price_cents integer,
  p_features jsonb,
  p_custom_text text,
  p_actor uuid
)
returns public.plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.plans;
  v_new public.plans;
begin
  if p_plan_id is null then
    insert into public.plans (code, name, price_cents, extra_seat_price_cents, features, custom_text)
    values (p_code, p_name, p_price_cents, p_extra_seat_price_cents, p_features, p_custom_text)
    returning * into v_new;

    insert into public.plan_audit_log (plan_id, action, changed_by, new_values)
    values (v_new.id, 'created', p_actor, to_jsonb(v_new));
    return v_new;
  end if;

  select * into v_old from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  -- code não muda depois de criado: o gateway e as checagens dependem dele.
  update public.plans
  set name = p_name,
      price_cents = p_price_cents,
      extra_seat_price_cents = p_extra_seat_price_cents,
      features = p_features,
      custom_text = p_custom_text
  where id = p_plan_id
  returning * into v_new;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (v_new.id, 'updated', p_actor, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

revoke execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, uuid)
  to service_role;
