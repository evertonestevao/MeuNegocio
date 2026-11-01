-- Anual em 12x no cartão: o parcelamento é uma compra única, sem renovação automática. A
-- assinatura vale até current_period_end e depois a empresa volta ao plano padrão.
alter table public.subscriptions
  add column renews boolean not null default true;

-- O valor de um parcelamento não muda depois de contratado, então não há como cobrar membro extra.
update public.plans set extra_seat_price_cents = 0 where code = 'anual';

-- Mesma regra de billingService.hasPlanAccess.
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
        (s.renews and s.status in ('trialing', 'active', 'past_due'))
        or (s.status in ('trialing', 'active', 'past_due', 'canceled') and s.current_period_end > now())
      )
    union all
    select p.features, p.extra_seat_price_cents, 1
    from public.plans p
    where p.code = 'free' and p.deleted_at is null
  ) terms
  order by priority
  limit 1;
$$;
