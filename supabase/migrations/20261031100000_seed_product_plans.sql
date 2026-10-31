-- Planos do MeuNegócio. Esta migration é só o seed inicial: depois de aplicada, quem manda
-- nos planos é o super_admin, em /admin/planos. Limite null significa ilimitado.
update public.plans
set name = 'Free',
    price_cents = 0,
    extra_seat_price_cents = 0,
    features = '{"max_members": 2, "max_clients": 30, "max_quotes_month": 20, "audit_retention_days": 7, "public_approval": false, "work_orders": false, "hours": false}'
where code = 'free';

update public.plans
set name = 'Pro',
    price_cents = 14900,
    extra_seat_price_cents = 1990,
    features = '{"max_members": 10, "max_clients": null, "max_quotes_month": null, "audit_retention_days": 90, "public_approval": true, "work_orders": true, "hours": true}'
where code = 'pro';

update public.plans
set name = 'Enterprise',
    price_cents = 59900,
    extra_seat_price_cents = 2990,
    features = '{"max_members": 50, "max_clients": null, "max_quotes_month": null, "audit_retention_days": 365, "public_approval": true, "work_orders": true, "hours": true}'
where code = 'enterprise';

-- plan_audit_log: histórico de alterações do catálogo de planos. Não tem company_id nem
-- deleted_at de propósito: plans é global, então audit_logs (que exige empresa) não serve,
-- e histórico não se apaga. Mesmo modelo de reseller_audit_log.
create table public.plan_audit_log (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id),
  action text not null check (action in ('created', 'updated', 'activated', 'deactivated')),
  changed_by uuid references auth.users (id) on delete set null,
  old_values jsonb,
  new_values jsonb not null,
  changed_at timestamptz not null default now()
);

create index plan_audit_log_changed_at_idx on public.plan_audit_log (changed_at desc);

alter table public.plan_audit_log enable row level security;

revoke all on public.plan_audit_log from anon, authenticated;
grant select on public.plan_audit_log to authenticated;

create policy "plan_audit_log_select_super_admin"
  on public.plan_audit_log
  for select
  to authenticated
  using (public.is_super_admin());

-- Escrita do catálogo: só pelo servidor, em uma transação com o histórico. O service_role não
-- tem auth.uid(), então quem alterou chega por parâmetro, depois de revalidado no servidor.
create or replace function public.admin_save_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_price_cents integer,
  p_extra_seat_price_cents integer,
  p_features jsonb,
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
    insert into public.plans (code, name, price_cents, extra_seat_price_cents, features)
    values (p_code, p_name, p_price_cents, p_extra_seat_price_cents, p_features)
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
      features = p_features
  where id = p_plan_id
  returning * into v_new;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (v_new.id, 'updated', p_actor, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

create or replace function public.admin_set_plan_active(
  p_plan_id uuid,
  p_is_active boolean,
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
  select * into v_old from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  update public.plans set is_active = p_is_active where id = p_plan_id returning * into v_new;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (
    v_new.id,
    case when p_is_active then 'activated' else 'deactivated' end,
    p_actor,
    to_jsonb(v_old),
    to_jsonb(v_new)
  );
  return v_new;
end;
$$;

revoke execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.admin_set_plan_active(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, uuid)
  to service_role;
grant execute on function public.admin_set_plan_active(uuid, boolean, uuid)
  to service_role;
