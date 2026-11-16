-- Planos privados: plano que só aparece para e-mails autorizados pelo super admin (ex.: preço
-- especial para um amigo ou parceiro). Plano comum continua público.
--
-- Quem enxerga um plano privado (RLS de plans):
--   1. e-mail confirmado que está na lista do plano (plan_access_emails);
--   2. membro de uma empresa que já tem assinatura nesse plano (precisa ver o próprio plano).
-- O checkout lê o plano pelo client do usuário, então a RLS também barra quem tentar assinar um
-- plano privado trocando o planId na requisição.

alter table public.plans
  add column if not exists is_public boolean not null default true;

-- plan_access_emails: lista de e-mails autorizados por plano privado. Como plans, é catálogo global
-- (sem company_id e sem deleted_at): remover um e-mail apaga a linha, e o histórico fica em
-- plan_audit_log. Sem GRANT e sem policy para anon/authenticated: só o service_role escreve e lê.
create table public.plan_access_emails (
  plan_id uuid not null references public.plans (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (plan_id, email)
);

alter table public.plan_access_emails enable row level security;
revoke all on public.plan_access_emails from anon, authenticated;

-- Histórico: liberar e remover acesso também ficam registrados.
alter table public.plan_audit_log drop constraint if exists plan_audit_log_action_check;
alter table public.plan_audit_log
  add constraint plan_audit_log_action_check
  check (action in ('created', 'updated', 'activated', 'deactivated', 'access_granted', 'access_revoked'));

-- O usuário logado pode ver este plano privado? Roda como dono para ler auth.users e a lista.
create or replace function public.can_view_private_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_access_emails a
    join auth.users u on lower(u.email) = a.email
    where a.plan_id = p_plan_id
      and u.id = auth.uid()
      and u.email_confirmed_at is not null
  ) or exists (
    select 1
    from public.subscriptions s
    join public.company_members cm on cm.company_id = s.company_id
    where s.plan_id = p_plan_id
      and s.deleted_at is null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
  );
$$;

revoke execute on function public.can_view_private_plan(uuid) from public, anon;
grant execute on function public.can_view_private_plan(uuid) to authenticated;

-- RLS de plans: plano privado sai da leitura geral. As duas policies são recriadas com a mesma regra
-- de antes (ativo e não deletado para visitante; não deletado para logado) mais a de visibilidade.
drop policy "plans_select_public_active" on public.plans;
create policy "plans_select_public_active"
  on public.plans
  for select
  to anon, authenticated
  using (deleted_at is null and is_active and is_public);

drop policy "plans_select_authenticated_all" on public.plans;
create policy "plans_select_authenticated_all"
  on public.plans
  for select
  to authenticated
  using (deleted_at is null and (is_public or public.can_view_private_plan(id)));

-- anon lê por colunas nomeadas, e a policy acima usa is_public.
grant select (is_public) on public.plans to anon;

-- Plano privado não vai para a lista de planos dos vendedores.
create or replace view public.reseller_available_plans with (security_barrier = true) as
select p.id, p.code, p.name, p.price_cents, p.currency, p.billing_interval
from public.plans p
where p.available_to_resellers
  and p.is_active
  and p.is_public
  and p.deleted_at is null
  and public.resellers_enabled()
  and public.current_reseller_id() is not null;

-- ---------------------------------------------------------------------------
-- Escrita do catálogo: admin_save_plan passa a gravar is_public.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, uuid);

create function public.admin_save_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_price_cents integer,
  p_extra_seat_price_cents integer,
  p_features jsonb,
  p_custom_text text,
  p_payment_methods text[],
  p_trial_days integer,
  p_is_public boolean,
  p_actor uuid
) returns public.plans
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old public.plans;
  v_new public.plans;
begin
  if p_plan_id is null then
    insert into public.plans (code, name, price_cents, extra_seat_price_cents, features, custom_text, payment_methods, trial_days, is_public)
    values (p_code, p_name, p_price_cents, p_extra_seat_price_cents, p_features, p_custom_text, p_payment_methods, p_trial_days, p_is_public)
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
      custom_text = p_custom_text,
      payment_methods = p_payment_methods,
      trial_days = p_trial_days,
      is_public = p_is_public
  where id = p_plan_id
  returning * into v_new;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (v_new.id, 'updated', p_actor, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

revoke execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, boolean, uuid)
  to service_role;

-- Libera (p_grant = true) ou remove (false) e-mails de um plano, com o histórico na mesma transação.
-- Só registra no histórico o que de fato mudou: e-mail que já estava (ou que não estava) é ignorado.
create function public.admin_set_plan_access(
  p_plan_id uuid,
  p_emails text[],
  p_grant boolean,
  p_actor uuid
) returns text[]
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_emails text[];
  v_changed text[];
begin
  perform 1 from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  select array_agg(distinct lower(btrim(e)))
  into v_emails
  from unnest(p_emails) as e
  where btrim(e) <> '';
  if v_emails is null then
    return array[]::text[];
  end if;

  if p_grant then
    with inserted as (
      insert into public.plan_access_emails (plan_id, email, added_by)
      select p_plan_id, e, p_actor from unnest(v_emails) as e
      on conflict do nothing
      returning email
    )
    select array_agg(email order by email) into v_changed from inserted;
  else
    with deleted as (
      delete from public.plan_access_emails
      where plan_id = p_plan_id and email = any (v_emails)
      returning email
    )
    select array_agg(email order by email) into v_changed from deleted;
  end if;

  if v_changed is not null then
    insert into public.plan_audit_log (plan_id, action, changed_by, new_values)
    values (
      p_plan_id,
      case when p_grant then 'access_granted' else 'access_revoked' end,
      p_actor,
      jsonb_build_object('emails', to_jsonb(v_changed))
    );
  end if;
  return coalesce(v_changed, array[]::text[]);
end;
$$;

revoke execute on function public.admin_set_plan_access(uuid, text[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_plan_access(uuid, text[], boolean, uuid) to service_role;
grant select, insert, delete on public.plan_access_emails to service_role;
