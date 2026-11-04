-- Alíquota efetiva do Simples Nacional calculada pelo faturamento dos 12 meses anteriores (RBT12).
-- Opcional: a empresa escolhe entre o cálculo automático e a alíquota informada à mão. O cálculo
-- fica no banco para valer igual na tela e na aprovação pelo link do cliente (trigger).
--
-- Alíquota efetiva = (RBT12 × alíquota nominal da faixa − parcela a deduzir) ÷ RBT12, pelas tabelas
-- da LC 123/2006 (redação da LC 155/2016). Mesma tabela de src/lib/simplesNacional.ts.

alter table public.company_profiles
  add column tax_rate_auto boolean not null default false,
  add column simples_annex text check (simples_annex in ('III', 'IV', 'V')),
  -- Folha de pagamento de 28% ou mais do faturamento: o Anexo V é tributado pelo Anexo III.
  add column fator_r boolean not null default false,
  -- Com menos de 12 meses de atividade, o RBT12 é a média dos meses de atividade × 12.
  add column activity_started_on date,
  add constraint company_profiles_tax_auto_check check (not tax_rate_auto or (tax_regime = 'simples' and simples_annex is not null));

-- Faturamento de um mês informado pela empresa (meses antes do sistema, ou o valor do contador).
-- Quando existe, vale no lugar do faturamento lançado no sistema naquele mês.
create table public.company_monthly_revenues (
  company_id uuid not null references public.companies (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents between 0 and 100000000000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, month)
);

alter table public.company_monthly_revenues enable row level security;

-- Leitura só de owner e admin: é faturamento. A escrita é por save_monthly_revenues.
create policy "company_monthly_revenues_select_admin" on public.company_monthly_revenues
  for select to authenticated using (public.is_company_admin(company_id) and deleted_at is null);

grant select on public.company_monthly_revenues to authenticated;

create trigger company_monthly_revenues_updated_at
  before update on public.company_monthly_revenues
  for each row execute function public.set_updated_at();

create or replace function public.simples_bracket(p_annex text, p_rbt12_cents bigint)
returns table (bracket integer, limit_cents bigint, nominal_bps integer, deduction_cents bigint)
language sql
immutable
set search_path = public
as $$
  select b.bracket, b.limit_cents, b.nominal_bps, b.deduction_cents
  from (values
    ('III', 1, 18000000::bigint, 600, 0::bigint),
    ('III', 2, 36000000, 1120, 936000),
    ('III', 3, 72000000, 1350, 1764000),
    ('III', 4, 180000000, 1600, 3564000),
    ('III', 5, 360000000, 2100, 12564000),
    ('III', 6, 480000000, 3300, 64800000),
    ('IV', 1, 18000000, 450, 0),
    ('IV', 2, 36000000, 900, 810000),
    ('IV', 3, 72000000, 1020, 1242000),
    ('IV', 4, 180000000, 1400, 3978000),
    ('IV', 5, 360000000, 2200, 18378000),
    ('IV', 6, 480000000, 3300, 82800000),
    ('V', 1, 18000000, 1550, 0),
    ('V', 2, 36000000, 1800, 450000),
    ('V', 3, 72000000, 1950, 990000),
    ('V', 4, 180000000, 2050, 1710000),
    ('V', 5, 360000000, 2300, 6210000),
    ('V', 6, 480000000, 3050, 54000000)
  ) as b(annex, bracket, limit_cents, nominal_bps, deduction_cents)
  -- Acima do teto, fica a última faixa: a tela avisa que a empresa passou do limite do Simples.
  where b.annex = p_annex and (p_rbt12_cents <= b.limit_cents or b.bracket = 6)
  order by b.bracket
  limit 1;
$$;

-- Cálculo do mês de apuração p_month. Interno: o app lê por get_company_tax.
create or replace function public.simples_rate_detail(p_company_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.company_profiles;
  v_annex text;
  v_month date := date_trunc('month', p_month)::date;
  v_from date := (date_trunc('month', p_month) - interval '12 months')::date;
  v_months integer := 12;
  v_total bigint;
  v_rbt12 bigint;
  v_bracket record;
  v_rate_bps integer;
begin
  select * into v_profile from public.company_profiles where company_id = p_company_id and deleted_at is null;
  if not found or v_profile.simples_annex is null then
    return null;
  end if;
  v_annex := case when v_profile.simples_annex = 'V' and v_profile.fator_r then 'III' else v_profile.simples_annex end;

  if v_profile.activity_started_on is not null and date_trunc('month', v_profile.activity_started_on)::date > v_from then
    v_from := least(date_trunc('month', v_profile.activity_started_on)::date, v_month);
    v_months := (extract(year from age(v_month, v_from)) * 12 + extract(month from age(v_month, v_from)))::integer;
  end if;

  select coalesce(sum(coalesce(informed.amount_cents, launched.amount_cents, 0)), 0) into v_total
  from generate_series(v_from, (v_month - interval '1 month')::date, interval '1 month') as g(month)
  left join public.company_monthly_revenues informed
    on informed.company_id = p_company_id and informed.month = g.month::date and informed.deleted_at is null
  left join lateral (
    select sum(r.amount_cents)::bigint as amount_cents from public.revenues r
    where r.company_id = p_company_id and r.deleted_at is null
      and r.competence_date >= g.month and r.competence_date < g.month + interval '1 month'
  ) launched on true;

  -- Sem nenhum mês anterior (primeiro mês de atividade), fica na primeira faixa.
  v_rbt12 := case when v_months = 0 then 0 when v_months < 12 then round(v_total::numeric / v_months * 12)::bigint else v_total end;
  select * into v_bracket from public.simples_bracket(v_annex, v_rbt12);
  v_rate_bps := case
    when v_rbt12 = 0 then v_bracket.nominal_bps
    else round((v_rbt12 * v_bracket.nominal_bps / 10000.0 - v_bracket.deduction_cents) / v_rbt12 * 10000)::integer
  end;

  return jsonb_build_object(
    'month', v_month,
    'annex', v_profile.simples_annex,
    'effective_annex', v_annex,
    'revenue_cents', v_total,
    'months', v_months,
    'rbt12_cents', v_rbt12,
    'bracket', v_bracket.bracket,
    'nominal_bps', v_bracket.nominal_bps,
    'deduction_cents', v_bracket.deduction_cents,
    'rate_bps', v_rate_bps,
    'over_limit', v_rbt12 > 480000000
  );
end;
$$;

-- Alíquota que vale hoje para a empresa; null sem regime informado. Interno: usado pelo trigger.
create or replace function public.effective_tax_rate_bps(p_company_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.company_profiles;
begin
  select * into v_profile from public.company_profiles where company_id = p_company_id and deleted_at is null;
  if not found or v_profile.tax_regime is null then return null; end if;
  if v_profile.tax_regime = 'mei' then return 0; end if;
  if v_profile.tax_rate_auto then
    return coalesce(
      (public.simples_rate_detail(p_company_id, public.company_today(p_company_id)) ->> 'rate_bps')::integer,
      v_profile.tax_rate_bps
    );
  end if;
  return v_profile.tax_rate_bps;
end;
$$;

create or replace function public.freeze_quote_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.tax_rate_bps is null then
    new.tax_rate_bps := public.effective_tax_rate_bps(new.company_id);
  end if;
  return new;
end;
$$;

-- Configuração, alíquota de hoje, cálculo do mês e os 12 meses da base. Só owner e admin.
create or replace function public.get_company_tax(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date;
  v_month date;
  v_profile public.company_profiles;
  v_months jsonb;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só o proprietário e o administrador veem os impostos' using errcode = '42501';
  end if;
  v_today := public.company_today(p_company_id);
  v_month := date_trunc('month', v_today)::date;
  select * into v_profile from public.company_profiles where company_id = p_company_id and deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'month', g.month::date,
    'launched_cents', coalesce(launched.amount_cents, 0),
    'informed_cents', informed.amount_cents
  ) order by g.month desc), '[]'::jsonb)
  into v_months
  from generate_series((v_month - interval '12 months')::date, (v_month - interval '1 month')::date, interval '1 month') as g(month)
  left join public.company_monthly_revenues informed
    on informed.company_id = p_company_id and informed.month = g.month::date and informed.deleted_at is null
  left join lateral (
    select sum(r.amount_cents)::bigint as amount_cents from public.revenues r
    where r.company_id = p_company_id and r.deleted_at is null
      and r.competence_date >= g.month and r.competence_date < g.month + interval '1 month'
  ) launched on true;

  return jsonb_build_object(
    'regime', v_profile.tax_regime,
    'manual_rate_bps', coalesce(v_profile.tax_rate_bps, 0),
    'auto', coalesce(v_profile.tax_rate_auto, false),
    'annex', v_profile.simples_annex,
    'fator_r', coalesce(v_profile.fator_r, false),
    'activity_started_on', v_profile.activity_started_on,
    'rate_bps', public.effective_tax_rate_bps(p_company_id),
    'detail', public.simples_rate_detail(p_company_id, v_today),
    'months', v_months
  );
end;
$$;

-- Grava o faturamento informado de meses já fechados. amount_cents null tira o valor informado.
create or replace function public.save_monthly_revenues(p_company_id uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_entry jsonb;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só o proprietário e o administrador informam o faturamento' using errcode = '42501';
  end if;
  v_month := date_trunc('month', public.company_today(p_company_id))::date;

  for v_entry in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if (v_entry ->> 'month')::date <> date_trunc('month', (v_entry ->> 'month')::date)::date
       or (v_entry ->> 'month')::date >= v_month
       or (v_entry ->> 'month')::date < v_month - interval '24 months' then
      raise exception 'Informe só meses já fechados, dos últimos dois anos.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_entry -> 'amount_cents') = 'number' then
      insert into public.company_monthly_revenues (company_id, month, amount_cents)
      values (p_company_id, (v_entry ->> 'month')::date, (v_entry ->> 'amount_cents')::bigint)
      on conflict (company_id, month) do update set amount_cents = excluded.amount_cents, deleted_at = null;
    else
      update public.company_monthly_revenues set deleted_at = now()
      where company_id = p_company_id and month = (v_entry ->> 'month')::date and deleted_at is null;
    end if;
  end loop;
end;
$$;

revoke execute on function public.simples_bracket(text, bigint) from public, anon, authenticated;
revoke execute on function public.simples_rate_detail(uuid, date) from public, anon, authenticated;
revoke execute on function public.effective_tax_rate_bps(uuid) from public, anon, authenticated;
revoke execute on function public.get_company_tax(uuid) from public, anon;
revoke execute on function public.save_monthly_revenues(uuid, jsonb) from public, anon;
grant execute on function public.get_company_tax(uuid) to authenticated;
grant execute on function public.save_monthly_revenues(uuid, jsonb) to authenticated;
