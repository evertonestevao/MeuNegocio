-- admin_overview: números da "Visão geral" do super admin, calculados de uma vez no banco.
-- Só o super admin chama (is_super_admin() dentro da função, que roda como dono para ler todas as
-- empresas). Não cria tabela nem muda policy: só lê.
--
-- Regras de cálculo:
--  - Receita mensal (MRR): assinaturas com cobrança de verdade (gateway_provider preenchido), ativas
--    ou em atraso e dentro do período. O anual entra dividido por 12. Empresa liberada pelo super admin
--    sem cobrança e teste sem cartão não entram. Vagas extras não entram.
--  - Cancelamentos: status 'canceled' com cobrança de verdade; a data é o updated_at da assinatura.
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
    coalesce(sum(case p.billing_interval when 'year' then round(s.contracted_price_cents / 12.0) else s.contracted_price_cents end), 0)::bigint,
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

  -- Falhas de comissão só existem para quem usa o módulo de revendedores: desligado, fica nulo.
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
