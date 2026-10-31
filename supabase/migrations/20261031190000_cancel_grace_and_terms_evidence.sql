-- Cancelamento: o plano segue até o fim do período pago, em qualquer gateway (o Asaas apaga a
-- assinatura na hora; o Stripe, no fim do período). Mesma regra de billingService.hasPlanAccess.
create or replace function public.company_plan_terms(p_company_id uuid)
returns table (features jsonb, extra_seat_price_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  select features, extra_seat_price_cents
  from (
    select p.features, s.contracted_extra_seat_price_cents as extra_seat_price_cents, 0 as priority
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.company_id = p_company_id
      and s.deleted_at is null
      and (
        s.status in ('trialing', 'active', 'past_due')
        or (s.status = 'canceled' and s.current_period_end > now())
      )
    union all
    select p.features, p.extra_seat_price_cents, 1
    from public.plans p
    where p.code = 'free' and p.deleted_at is null
  ) terms
  order by priority
  limit 1;
$$;

-- Evidência de aceite: só o servidor grava, com IP e navegador lidos da request. Antes, o usuário
-- inseria direto e escolhia os valores. Continua lendo os próprios registros.
drop policy "terms_acceptances_insert_own" on public.terms_acceptances;
drop policy "user_consents_insert_own" on public.user_consents;
revoke insert on public.terms_acceptances, public.user_consents from authenticated;
