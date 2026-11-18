-- Plano Piloto: plano de preço zero, privado e sem prazo, para uma empresa usar de graça até o super
-- admin encerrar. Não é o plano `free` do sistema (esse só guarda os limites de quem não assina).
--
-- Como funciona:
--   * Plano piloto = plano ativo, mensal, privado, de preço 0 e com código diferente de `free`.
--   * A assinatura do piloto nasce `active`, sem fim (current_period_end nulo) e sem gateway
--     (external_subscription_id e gateway_provider nulos). `renews = true` é o que faz as regras de
--     acesso já existentes (hasPlanAccess e company_plan_terms) a tratarem como vigente, sem mudar nada.
--   * Encerrar guarda a assinatura no histórico (deleted_at) e tira o e-mail do proprietário da lista do
--     plano. Nada da empresa é apagado: sem assinatura válida ela cai em /assinar, e os dados ficam
--     guardados até assinar. Soft-deletada, a assinatura também deixa de dar à empresa a visão do plano
--     (can_view_private_plan exige deleted_at nulo).
--   * Preço zero nunca entra na receita (admin_overview exige gateway_provider) nem gera comissão.
--
-- As três funções só rodam com service_role: o servidor revalida quem é o ator antes de chamar.

-- ---------------------------------------------------------------------------
-- Ativar o piloto (o proprietário escolhe em /assinar). Mesma trava do checkout: plano privado,
-- e-mail confirmado na lista do plano e ator proprietário da empresa.
-- ---------------------------------------------------------------------------
create function public.activate_pilot_plan(p_company_id uuid, p_plan_id uuid, p_user_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.subscriptions;
  v_new public.subscriptions;
begin
  perform 1 from public.plans
  where id = p_plan_id
    and deleted_at is null
    and is_active
    and price_cents = 0
    and not is_public
    and code <> 'free'
    and billing_interval = 'month';
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  perform 1 from public.company_members
  where company_id = p_company_id and user_id = p_user_id and role = 'owner' and deleted_at is null;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- O plano só vale para quem o super admin liberou: e-mail confirmado na lista do plano.
  perform 1
  from public.plan_access_emails a
  join auth.users u on lower(u.email) = a.email
  where a.plan_id = p_plan_id and u.id = p_user_id and u.email_confirmed_at is not null;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  select * into v_current
  from public.subscriptions
  where company_id = p_company_id and deleted_at is null
  for update;

  if found then
    -- Mesma regra de company_plan_terms: assinatura com acesso não se troca por aqui.
    if (v_current.renews and v_current.status in ('trialing', 'active', 'past_due'))
       or (v_current.status in ('trialing', 'active', 'past_due', 'canceled') and v_current.current_period_end > now()) then
      raise exception 'already_subscribed';
    end if;
    -- Sem acesso (cancelada, vencida): vai para o histórico, que não se apaga.
    update public.subscriptions set deleted_at = now() where id = v_current.id;
  end if;

  insert into public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end, renews)
  values (p_company_id, p_plan_id, 'active', now(), null, true)
  returning * into v_new;
  return v_new;
end;
$$;

revoke execute on function public.activate_pilot_plan(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_pilot_plan(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Encerrar o piloto (só o super admin, pelo servidor). A assinatura vai para o histórico e o e-mail
-- dos proprietários sai da lista do plano. Devolve o que foi feito, para o servidor auditar.
-- ---------------------------------------------------------------------------
create function public.end_pilot_plan(p_company_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions;
  v_removed text[];
begin
  -- O piloto se reconhece pela assinatura (ativa, sem gateway e sem fim), não pelo plano: se o plano mudar
  -- de preço depois, a empresa continua encerrável. Só activate_pilot_plan e admin_create_company criam isso.
  select * into v_sub
  from public.subscriptions
  where company_id = p_company_id
    and deleted_at is null
    and status = 'active'
    and renews
    and external_subscription_id is null
    and current_period_end is null
  for update;
  if not found then
    raise exception 'pilot_not_found' using errcode = 'P0002';
  end if;

  update public.subscriptions
  set status = 'canceled', current_period_end = now(), renews = false, deleted_at = now()
  where id = v_sub.id;

  with owners as (
    select lower(u.email) as email
    from public.company_members cm
    join auth.users u on u.id = cm.user_id
    where cm.company_id = p_company_id and cm.role = 'owner' and cm.deleted_at is null
  ), removed as (
    delete from public.plan_access_emails
    where plan_id = v_sub.plan_id and email in (select email from owners)
    returning email
  )
  select array_agg(email order by email) into v_removed from removed;

  if v_removed is not null then
    insert into public.plan_audit_log (plan_id, action, changed_by, new_values)
    values (v_sub.plan_id, 'access_revoked', p_actor, jsonb_build_object('emails', to_jsonb(v_removed), 'reason', 'pilot_ended'));
  end if;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan_id', v_sub.plan_id,
    'removed_emails', to_jsonb(coalesce(v_removed, array[]::text[]))
  );
end;
$$;

revoke execute on function public.end_pilot_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.end_pilot_plan(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Criar empresa com plano: além do plano pago de antes (período do plano, sem renovar), aceita o
-- plano piloto (privado, preço 0, sem prazo).
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_company(
  p_name text,
  p_slug text,
  p_owner uuid,
  p_plan_id uuid,
  p_actor uuid
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_plan public.plans;
begin
  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, p_owner)
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_company.id, p_owner, 'owner', p_actor);

  if p_plan_id is not null then
    select * into v_plan
    from public.plans
    where id = p_plan_id
      and deleted_at is null
      and is_active
      and (price_cents > 0 or (price_cents = 0 and not is_public and code <> 'free' and billing_interval = 'month'));
    if not found then
      raise exception 'plan_not_found' using errcode = 'P0002';
    end if;

    if v_plan.price_cents = 0 then
      -- Piloto: sem prazo e sem gateway, até o super admin encerrar.
      insert into public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end, renews)
      values (v_company.id, p_plan_id, 'active', now(), null, true);
    else
      insert into public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end, renews)
      values (
        v_company.id, p_plan_id, 'active', now(),
        now() + case when v_plan.billing_interval = 'year' then interval '1 year' else interval '1 month' end,
        false
      );
    end if;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_company.id, p_actor, 'company.created', 'company', v_company.id, jsonb_build_object('plan_id', p_plan_id));

  return v_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plano "Piloto" inicial: privado, preço 0, com os mesmos limites e recursos do Mensal (`pro`). Só
-- nasce se o Mensal existe e se ainda não há um `piloto`. Depois disso o plano é do super admin
-- (/admin/planos): dá para editar os limites e liberar os e-mails.
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, price_cents, extra_seat_price_cents, features, payment_methods, trial_days, billing_interval, is_public, custom_text)
select 'piloto', 'Cortesia', 0, 0, features, payment_methods, 0, 'month', false,
       'Acesso liberado, sem cobrança.'
from public.plans
where code = 'pro' and deleted_at is null
  and not exists (select 1 from public.plans where code = 'piloto');
