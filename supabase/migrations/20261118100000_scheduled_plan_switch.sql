-- Troca de plano agendada para o fim do período já pago. A assinatura continua no plano atual até lá;
-- o plano novo entra quando o período acaba (primeira cobrança do plano novo).
--   scheduled_plan_id: plano que entra no fim do período;
--   scheduled_change_at: quando entra (fim do período pago);
--   scheduled_external_subscription_id: assinatura do plano novo já criada no gateway (plano atual
--   mensal), cuja primeira cobrança vence nesta data. Em ciclo (parcelas), fica nulo: o próximo termo
--   é criado na renovação, já com o plano novo.
alter table public.subscriptions
  add column if not exists scheduled_plan_id uuid references public.plans(id),
  add column if not exists scheduled_change_at timestamptz,
  add column if not exists scheduled_external_subscription_id text;

-- Plano com troca agendada para ele está em uso: não se exclui.
create or replace function public.admin_plan_usage()
returns table (plan_id uuid, subscribers integer, reseller_links integer, commission_rules integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*)::integer from public.subscriptions s
       where (s.plan_id = p.id or s.scheduled_plan_id = p.id) and s.deleted_at is null),
    (select count(*)::integer from public.reseller_clients c where c.plan_id = p.id and c.deleted_at is null),
    (select count(*)::integer from public.commission_rules r where r.plan_id = p.id and r.deleted_at is null)
  from public.plans p
  where p.deleted_at is null;
$$;

create or replace function public.admin_delete_plan(p_plan_id uuid, p_actor uuid)
returns public.plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.plans;
  v_new public.plans;
  v_in_use integer;
begin
  select * into v_old from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  select
    (select count(*) from public.subscriptions
       where (plan_id = p_plan_id or scheduled_plan_id = p_plan_id) and deleted_at is null)
    + (select count(*) from public.reseller_clients where plan_id = p_plan_id and deleted_at is null)
    + (select count(*) from public.commission_rules where plan_id = p_plan_id and deleted_at is null)
  into v_in_use;
  if v_in_use > 0 then
    raise exception 'plan_in_use';
  end if;

  update public.plans
  set deleted_at = now(),
      is_active = false,
      code = code || '_excluido_' || substr(id::text, 1, 8)
  where id = p_plan_id
  returning * into v_new;

  delete from public.plan_access_emails where plan_id = p_plan_id;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (v_new.id, 'deleted', p_actor, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;
