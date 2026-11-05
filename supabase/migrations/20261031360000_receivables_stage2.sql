-- Recebimentos, etapa 2: condições de pagamento combinadas no orçamento (o cliente vê no link e no
-- PDF, e o fechamento já vem preenchido), taxa da maquininha como custo do serviço e regime de caixa
-- no RBT12 do Simples Nacional.

-- Condições de pagamento: { kind: cash | entry | card, method, entry_cents, entry_method, count }.
-- NULL é "a combinar". Datas não entram: as parcelas contam a partir do fechamento.
alter table public.quotes
  add column payment_plan jsonb check (payment_plan is null or jsonb_typeof(payment_plan) = 'object');

create or replace function public.set_quote_payment_plan(p_company_id uuid, p_quote_id uuid, p_plan jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_methods constant text[] := array['pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other'];
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para editar orçamentos' using errcode = '42501';
  end if;
  if p_plan is not null and (
    jsonb_typeof(p_plan) <> 'object'
    or coalesce(p_plan ->> 'kind', '') not in ('cash', 'entry', 'card')
    or (p_plan ->> 'method' is not null and not (p_plan ->> 'method') = any (v_methods))
    or (p_plan ->> 'entry_method' is not null and not (p_plan ->> 'entry_method') = any (v_methods))
    or jsonb_typeof(coalesce(p_plan -> 'count', '1'::jsonb)) <> 'number'
    or coalesce((p_plan ->> 'count')::numeric, 1) not between 1 and 60
    or jsonb_typeof(coalesce(p_plan -> 'entry_cents', '0'::jsonb)) <> 'number'
    or coalesce((p_plan ->> 'entry_cents')::numeric, 0) not between 0 and 1000000000
  ) then
    raise exception 'Confira as condições de pagamento.' using errcode = 'P0001';
  end if;

  update public.quotes
  set payment_plan = case when p_plan is null then null else jsonb_build_object(
    'kind', p_plan ->> 'kind',
    'method', p_plan ->> 'method',
    'entry_cents', coalesce((p_plan ->> 'entry_cents')::integer, 0),
    'entry_method', p_plan ->> 'entry_method',
    'count', coalesce((p_plan ->> 'count')::integer, 1)
  ) end
  where id = p_quote_id and company_id = p_company_id and deleted_at is null and status = 'draft';
  if not found then
    raise exception 'Só orçamentos em rascunho podem ser editados.' using errcode = 'P0001';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_quote(p_company_id uuid, p_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source public.quotes;
  v_number integer;
  v_new_id uuid;
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para criar orçamentos' using errcode = '42501';
  end if;

  select * into v_source from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;

  v_number := public.next_quote_number(p_company_id);

  insert into public.quotes (
    company_id, number, client_id, location_id, title, discount_cents,
    subtotal_cents, total_cents, notes, payment_plan, created_by
  )
  values (
    p_company_id, v_number, v_source.client_id, v_source.location_id, v_source.title, v_source.discount_cents,
    v_source.subtotal_cents, v_source.total_cents, v_source.notes, v_source.payment_plan, auth.uid()
  )
  returning id into v_new_id;

  insert into public.quote_items (
    company_id, quote_id, catalog_item_id, sort_order, description, unit,
    pricing_mode, quantity, people, unit_price_cents, line_total_cents
  )
  select
    company_id, v_new_id, catalog_item_id, sort_order, description, unit,
    pricing_mode, quantity, people, unit_price_cents, line_total_cents
  from public.quote_items
  where quote_id = p_quote_id and deleted_at is null;

  -- A nova versão leva o custo de cada item.
  insert into public.quote_item_costs (company_id, quote_item_id, cost_cents)
  select p_company_id, target.id, c.cost_cents
  from public.quote_items source
  join public.quote_item_costs c on c.quote_item_id = source.id
  join public.quote_items target on target.quote_id = v_new_id and target.sort_order = source.sort_order
  where source.quote_id = p_quote_id and source.deleted_at is null;

  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_quote(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'company_id', q.company_id,
    'quote_id', q.id,
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'valid_until', q.valid_until,
    'is_within_validity', q.valid_until >= public.company_today(q.company_id),
    'created_at', q.created_at,
    'subtotal_cents', q.subtotal_cents,
    'discount_cents', q.discount_cents,
    'total_cents', q.total_cents,
    'notes', q.notes,
    'payment_plan', q.payment_plan,
    'company', jsonb_build_object(
      'name', co.name, 'cnpj', p.cnpj, 'phone', p.phone, 'email', p.email, 'address', p.address
    ),
    'client', jsonb_build_object('name', c.name, 'document', c.document),
    'location', case when l.id is null then null
      else jsonb_build_object('name', l.name, 'address', l.address) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', i.description, 'unit', i.unit, 'pricing_mode', i.pricing_mode,
        'quantity', i.quantity, 'people', i.people,
        'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents
      ) order by i.sort_order)
      from public.quote_items i
      where i.quote_id = q.id and i.deleted_at is null
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object('decision', r.decision, 'name', r.name, 'comment', r.comment, 'created_at', r.created_at,
        'signature_path', r.signature_path)
      from public.quote_responses r
      where r.quote_id = q.id and r.deleted_at is null
      order by r.created_at desc
      limit 1
    )
  )
  from public.quotes q
  join public.companies co on co.id = q.company_id and co.deleted_at is null
  join public.clients c on c.id = q.client_id
  left join public.client_locations l on l.id = q.location_id
  left join public.company_profiles p on p.company_id = q.company_id
  where q.public_token = p_token
    and q.deleted_at is null
    and q.status <> 'draft';
$function$;

-- Taxas da maquininha, em centésimos de ponto percentual (3,49% = 349). Viram custo do serviço.
alter table public.company_profiles
  add column card_fee_credit_bps integer not null default 0 check (card_fee_credit_bps between 0 and 2000),
  add column card_fee_debit_bps integer not null default 0 check (card_fee_debit_bps between 0 and 2000),
  -- Simples Nacional pelo regime de caixa: o RBT12 soma o recebido, não o faturado.
  add column tax_cash_basis boolean not null default false;

alter table public.receivables
  add column fee_cents integer not null default 0 check (fee_cents >= 0),
  add constraint receivables_fee_check check (fee_cents <= amount_cents);

create or replace function public.card_fee_cents(p_company_id uuid, p_method text, p_amount_cents integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(p_amount_cents * case p_method
    when 'credit' then p.card_fee_credit_bps
    when 'debit' then p.card_fee_debit_bps
    else 0 end / 10000.0)::integer, 0)
  from (select 1) as one
  left join public.company_profiles p on p.company_id = p_company_id and p.deleted_at is null;
$$;

create or replace function public.close_quote(p_company_id uuid, p_quote_id uuid, p_amount_cents integer, p_competence_date date, p_installments jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_today date;
  v_entries jsonb := coalesce(p_installments, '[]'::jsonb);
  v_total bigint;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só owner e admin fecham orçamentos' using errcode = '42501';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = 'P0001';
  end if;
  if p_competence_date is null then
    raise exception 'Informe a data de competência.' using errcode = 'P0001';
  end if;
  v_today := public.company_today(p_company_id);
  if jsonb_typeof(v_entries) <> 'array' or jsonb_array_length(v_entries) > 60 then
    raise exception 'Use até 60 parcelas.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_entries) = 0 then
    v_entries := jsonb_build_array(jsonb_build_object(
      'amount_cents', p_amount_cents, 'due_date', p_competence_date, 'method', null, 'received', true
    ));
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_entries) as e(value)
    where jsonb_typeof(e.value -> 'amount_cents') <> 'number'
       or (e.value ->> 'amount_cents')::bigint <= 0
       or (e.value ->> 'due_date') is null
       or coalesce(e.value ->> 'method', 'pix') not in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other')
  ) then
    raise exception 'Confira o valor, o vencimento e a forma de cada parcela.' using errcode = 'P0001';
  end if;
  select sum((e.value ->> 'amount_cents')::bigint) into v_total from jsonb_array_elements(v_entries) as e(value);
  if v_total <> p_amount_cents then
    raise exception 'As parcelas precisam somar o valor fechado.' using errcode = 'P0001';
  end if;

  select status into v_status from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_status <> 'approved' then
    raise exception 'Só orçamentos aprovados podem ser fechados.' using errcode = 'P0001';
  end if;

  update public.quotes set status = 'closed', closed_at = now() where id = p_quote_id;
  insert into public.revenues (company_id, quote_id, amount_cents, competence_date)
  values (p_company_id, p_quote_id, p_amount_cents, p_competence_date);

  -- Parcela no cartão leva a taxa da maquininha; recebida, entra no caixa já sem ela.
  insert into public.receivables (company_id, quote_id, amount_cents, due_date, method, fee_cents, received_on, received_cents)
  select
    p_company_id, p_quote_id, e.amount, e.due_date, e.method, e.fee,
    case when e.received then least(e.due_date, v_today) end,
    case when e.received then e.amount - e.fee end
  from (
    select
      (value ->> 'amount_cents')::integer as amount,
      (value ->> 'due_date')::date as due_date,
      value ->> 'method' as method,
      coalesce((value ->> 'received')::boolean, false) as received,
      public.card_fee_cents(p_company_id, value ->> 'method', (value ->> 'amount_cents')::integer) as fee
    from jsonb_array_elements(v_entries)
  ) as e;
end;
$$;

-- Baixa. O esperado é o valor menos a taxa; recebido menos que isso deixa o restante a receber.
create or replace function public.receive_installment(
  p_company_id uuid, p_id uuid, p_received_on date, p_received_cents integer, p_method text, p_rest_due_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.receivables;
  v_fee integer;
  v_expected integer;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só o proprietário e o administrador dão baixa em recebimentos' using errcode = '42501';
  end if;
  select * into v_row from public.receivables
  where id = p_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Parcela não encontrada.' using errcode = 'P0001';
  end if;
  if v_row.received_on is not null then
    raise exception 'Esta parcela já foi recebida.' using errcode = 'P0001';
  end if;
  if p_received_on is null or p_received_on > public.company_today(p_company_id) then
    raise exception 'Informe a data em que recebeu, até hoje.' using errcode = 'P0001';
  end if;
  if p_method is not null and p_method not in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  -- Mudou a forma na baixa: a taxa acompanha.
  v_fee := case when p_method is null or p_method is not distinct from v_row.method then v_row.fee_cents
    else public.card_fee_cents(p_company_id, p_method, v_row.amount_cents) end;
  v_expected := v_row.amount_cents - v_fee;
  if p_received_cents is null or p_received_cents <= 0 or p_received_cents > v_row.amount_cents then
    raise exception 'Informe um valor recebido de até %.', to_char(v_row.amount_cents / 100.0, 'FM999G999G990D00') using errcode = 'P0001';
  end if;

  if p_received_cents < v_expected then
    -- O que faltou entrar vira parcela nova; a taxa fica com a parte já recebida.
    insert into public.receivables (company_id, quote_id, amount_cents, due_date, method)
    values (p_company_id, v_row.quote_id, v_expected - p_received_cents, coalesce(p_rest_due_date, v_row.due_date), coalesce(p_method, v_row.method));
    update public.receivables
    set amount_cents = p_received_cents + v_fee, fee_cents = v_fee, received_on = p_received_on, received_cents = p_received_cents,
        method = coalesce(p_method, method)
    where id = p_id;
  else
    -- Recebeu o esperado ou mais (taxa menor que a cadastrada): a diferença sai da taxa.
    update public.receivables
    set fee_cents = v_row.amount_cents - p_received_cents, received_on = p_received_on, received_cents = p_received_cents,
        method = coalesce(p_method, method)
    where id = p_id;
  end if;
end;
$$;

create or replace function public.reschedule_installment(p_company_id uuid, p_id uuid, p_due_date date, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só o proprietário e o administrador alteram recebimentos' using errcode = '42501';
  end if;
  if p_due_date is null then
    raise exception 'Informe o vencimento.' using errcode = 'P0001';
  end if;
  if p_method is not null and p_method not in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  update public.receivables
  set due_date = p_due_date, method = p_method, fee_cents = public.card_fee_cents(p_company_id, p_method, amount_cents)
  where id = p_id and company_id = p_company_id and deleted_at is null and received_on is null;
  if not found then
    raise exception 'Só parcelas a receber podem ser alteradas.' using errcode = 'P0001';
  end if;
end;
$$;

-- Faturamento do mês para o RBT12: pela competência (padrão) ou pelo recebido (regime de caixa).
create or replace function public.tax_month_revenue_cents(p_company_id uuid, p_month date, p_cash_basis boolean)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case when p_cash_basis then
    (select coalesce(sum(r.received_cents + r.fee_cents), 0)::bigint from public.receivables r
     where r.company_id = p_company_id and r.deleted_at is null
       and r.received_on >= p_month and r.received_on < p_month + interval '1 month')
  else
    (select coalesce(sum(r.amount_cents), 0)::bigint from public.revenues r
     where r.company_id = p_company_id and r.deleted_at is null
       and r.competence_date >= p_month and r.competence_date < p_month + interval '1 month')
  end;
$$;

CREATE OR REPLACE FUNCTION public.simples_rate_detail(p_company_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  cross join lateral (
    select public.tax_month_revenue_cents(p_company_id, g.month::date, coalesce(v_profile.tax_cash_basis, false)) as amount_cents
  ) launched;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_company_tax(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  cross join lateral (
    select public.tax_month_revenue_cents(p_company_id, g.month::date, coalesce(v_profile.tax_cash_basis, false)) as amount_cents
  ) launched;

  return jsonb_build_object(
    'regime', v_profile.tax_regime,
    'manual_rate_bps', coalesce(v_profile.tax_rate_bps, 0),
    'auto', coalesce(v_profile.tax_rate_auto, false),
    'annex', v_profile.simples_annex,
    'fator_r', coalesce(v_profile.fator_r, false),
    'activity_started_on', v_profile.activity_started_on,
    'cash_basis', coalesce(v_profile.tax_cash_basis, false),
    'rate_bps', public.effective_tax_rate_bps(p_company_id),
    'detail', public.simples_rate_detail(p_company_id, v_today),
    'months', v_months
  );
end;
$function$;

revoke execute on function public.card_fee_cents(uuid, text, integer), public.tax_month_revenue_cents(uuid, date, boolean) from public, anon, authenticated;
revoke execute on function public.set_quote_payment_plan(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_quote_payment_plan(uuid, uuid, jsonb) to authenticated;
