-- Parcelas do ciclo do plano anual. Antes o ciclo era sempre 12 cobranças mensais; agora cada plano
-- anual diz quantas (1 a 12). Serve para planos semestrais ou trimestrais e, principalmente, para
-- TESTAR a renovação sem esperar 12 meses: com 1 parcela, o ciclo termina na primeira cobrança paga.
--
-- term_payments só vale para billing_interval = 'year' (no mensal fica 12 e é ignorado). Como o
-- código e o tipo de cobrança, define-se na criação e não muda depois: assim a receita mensal
-- (total / parcelas) e os ciclos já contratados no gateway nunca ficam inconsistentes. Para
-- corrigir, exclui-se o plano (se ninguém usa) e cria-se outro.

alter table public.plans
  add column if not exists term_payments integer not null default 12;

alter table public.plans
  drop constraint if exists plans_term_payments_range,
  add constraint plans_term_payments_range check (term_payments between 1 and 12);

-- admin_save_plan passa a gravar o tipo de cobrança e as parcelas na CRIAÇÃO. Na edição os dois
-- ficam como estão. Recriada com a nova assinatura.
drop function if exists public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, boolean, uuid);

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
  p_billing_interval text,
  p_term_payments integer,
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
    insert into public.plans (
      code, name, price_cents, extra_seat_price_cents, features, custom_text,
      payment_methods, trial_days, is_public, billing_interval, term_payments
    )
    values (
      p_code, p_name, p_price_cents, p_extra_seat_price_cents, p_features, p_custom_text,
      p_payment_methods, p_trial_days, p_is_public, p_billing_interval, p_term_payments
    )
    returning * into v_new;

    insert into public.plan_audit_log (plan_id, action, changed_by, new_values)
    values (v_new.id, 'created', p_actor, to_jsonb(v_new));
    return v_new;
  end if;

  select * into v_old from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  -- code, billing_interval e term_payments não mudam depois de criados: o gateway, os ciclos já
  -- contratados e a receita mensal dependem deles.
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

revoke execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, boolean, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, boolean, text, integer, uuid)
  to service_role;

-- Receita mensal da Visão geral: o plano anual conta o total dividido pelas parcelas do ciclo (antes,
-- sempre por 12). O resto da função é o mesmo.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_since timestamptz := now() - interval '30 days';
  v_before timestamptz := now() - interval '60 days';
  v_mrr bigint;
  v_active integer;
  v_past_due integer;
  v_trialing integer;
  v_trials_ending integer;
  v_companies_now integer;
  v_companies_prev integer;
  v_canceled_now integer;
  v_canceled_prev integer;
  v_suspended integer;
  v_abuse integer;
  v_stuck integer;
  v_failures integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select
    coalesce(sum(case p.billing_interval when 'year' then round(s.contracted_price_cents / p.term_payments::numeric) else s.contracted_price_cents end), 0)::bigint,
    count(*) filter (where s.status = 'active')
  into v_mrr, v_active
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.deleted_at is null
    and s.gateway_provider is not null
    and s.status in ('active', 'past_due')
    and (s.current_period_end is null or s.current_period_end > v_now);

  select
    count(*) filter (where status = 'past_due'),
    count(*) filter (where status = 'trialing'),
    count(*) filter (where status = 'trialing' and current_period_end between v_now and v_now + interval '7 days')
  into v_past_due, v_trialing, v_trials_ending
  from public.subscriptions
  where deleted_at is null;

  select
    count(*) filter (where created_at >= v_since),
    count(*) filter (where created_at >= v_before and created_at < v_since),
    count(*) filter (where suspended_at is not null)
  into v_companies_now, v_companies_prev, v_suspended
  from public.companies
  where deleted_at is null;

  select
    count(*) filter (where updated_at >= v_since),
    count(*) filter (where updated_at >= v_before and updated_at < v_since)
  into v_canceled_now, v_canceled_prev
  from public.subscriptions
  where status = 'canceled' and gateway_provider is not null;

  select count(*) into v_abuse from public.abuse_reports where created_at >= v_now - interval '7 days';

  select count(*) into v_stuck
  from public.signup_leads
  where stage <> 'done' and updated_at < v_now - interval '2 days';

  if public.resellers_enabled() then
    select count(*) into v_failures from public.reseller_commission_failures where resolved_at is null;
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'mrr_cents', v_mrr,
    'active_subscribers', v_active,
    'past_due', v_past_due,
    'trialing', v_trialing,
    'trials_ending_7d', v_trials_ending,
    'new_companies', jsonb_build_object('current', v_companies_now, 'previous', v_companies_prev),
    'canceled', jsonb_build_object('current', v_canceled_now, 'previous', v_canceled_prev),
    'suspended_companies', v_suspended,
    'abuse_reports_7d', v_abuse,
    'stuck_signups', v_stuck,
    'reseller_failures', v_failures
  );
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
