-- Custo de cada item do orçamento, só para owner e admin. Com ele, quem revende o serviço de um
-- parceiro coloca o que o parceiro cobra e o acréscimo, e a margem estimada fica certa. O cliente
-- nunca vê: o link público, o PDF e o membro leem só o preço.

create table public.quote_item_costs (
  quote_item_id uuid primary key references public.quote_items (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  cost_cents integer not null check (cost_cents between 0 and 1000000000),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.quote_item_costs enable row level security;

-- Leitura só de owner e admin; a escrita é pelas funções de orçamento.
create policy "quote_item_costs_select_admin" on public.quote_item_costs
  for select to authenticated using (public.is_company_admin(company_id) and deleted_at is null);

grant select on public.quote_item_costs to authenticated;

CREATE OR REPLACE FUNCTION public.save_quote(p_company_id uuid, p_quote_id uuid, p_client_id uuid, p_location_id uuid, p_title text, p_valid_until date, p_discount_cents integer, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote_id uuid := p_quote_id;
  v_number integer;
  v_status text;
  v_subtotal bigint;
  -- Custo de cada item: só owner e admin veem e gravam. Quem não vê mantém o que já estava.
  v_sees_cost boolean := public.is_company_admin(p_company_id);
  v_previous_costs jsonb := '[]'::jsonb;
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para editar orçamentos' using errcode = '42501';
  end if;

  if p_location_id is not null and not exists (
    select 1 from public.client_locations
    where id = p_location_id and company_id = p_company_id
      and client_id = p_client_id and deleted_at is null
  ) then
    raise exception 'O local não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients
    where id = p_client_id and company_id = p_company_id and deleted_at is null
  ) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0001';
  end if;

  if v_quote_id is null then
    v_number := public.next_quote_number(p_company_id);

    insert into public.quotes (company_id, number, created_by)
    values (p_company_id, v_number, auth.uid())
    returning id into v_quote_id;
  else
    select status into v_status from public.quotes
    where id = v_quote_id and company_id = p_company_id and deleted_at is null
    for update;
    if not found then
      raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
    end if;
    if v_status <> 'draft' then
      raise exception 'Só orçamentos em rascunho podem ser editados. Use "Duplicar" para criar uma nova versão.' using errcode = 'P0001';
    end if;
  end if;

  if not v_sees_cost then
    select coalesce(jsonb_agg(jsonb_build_object('sort_order', qi.sort_order, 'description', qi.description, 'cost_cents', c.cost_cents)), '[]'::jsonb)
    into v_previous_costs
    from public.quote_items qi
    join public.quote_item_costs c on c.quote_item_id = qi.id
    where qi.quote_id = v_quote_id;
  end if;

  delete from public.quote_items where quote_id = v_quote_id and company_id = p_company_id;

  insert into public.quote_items (
    company_id, quote_id, catalog_item_id, sort_order, description, unit,
    pricing_mode, quantity, people, unit_price_cents, line_total_cents
  )
  select
    p_company_id,
    v_quote_id,
    item.catalog_item_id,
    item.ordinality - 1,
    item.description,
    item.unit,
    item.pricing_mode,
    item.quantity,
    case when item.pricing_mode = 'hourly' then greatest(coalesce(item.people, 1), 1) else 1 end,
    item.unit_price_cents,
    -- Arredonda só no fim da linha.
    round(
      item.quantity
      * case when item.pricing_mode = 'hourly' then greatest(coalesce(item.people, 1), 1) else 1 end
      * item.unit_price_cents
    )::integer
  from rows from (
    jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as (
      catalog_item_id uuid,
      description text,
      unit text,
      pricing_mode text,
      quantity numeric,
      people integer,
      unit_price_cents integer
    )
  ) with ordinality as item(
    catalog_item_id, description, unit, pricing_mode, quantity, people, unit_price_cents, ordinality
  );

  if v_sees_cost then
    insert into public.quote_item_costs (company_id, quote_item_id, cost_cents)
    select p_company_id, qi.id, (item.value ->> 'cost_cents')::integer
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as item(value, ord)
    join public.quote_items qi on qi.quote_id = v_quote_id and qi.sort_order = item.ord - 1
    where jsonb_typeof(item.value -> 'cost_cents') = 'number' and (item.value ->> 'cost_cents')::integer >= 0;
  else
    insert into public.quote_item_costs (company_id, quote_item_id, cost_cents)
    select p_company_id, qi.id, (previous.value ->> 'cost_cents')::integer
    from jsonb_array_elements(v_previous_costs) as previous(value)
    join public.quote_items qi
      on qi.quote_id = v_quote_id
     and qi.sort_order = (previous.value ->> 'sort_order')::integer
     and qi.description = previous.value ->> 'description';
  end if;

  select coalesce(sum(line_total_cents), 0) into v_subtotal
  from public.quote_items where quote_id = v_quote_id;

  update public.quotes
  set client_id = p_client_id,
      location_id = p_location_id,
      title = nullif(trim(p_title), ''),
      valid_until = p_valid_until,
      discount_cents = greatest(coalesce(p_discount_cents, 0), 0),
      notes = nullif(trim(p_notes), ''),
      subtotal_cents = v_subtotal,
      total_cents = greatest(v_subtotal - greatest(coalesce(p_discount_cents, 0), 0), 0)
  where id = v_quote_id;

  return v_quote_id;
end;
$function$;

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
    subtotal_cents, total_cents, notes, created_by
  )
  values (
    p_company_id, v_number, v_source.client_id, v_source.location_id, v_source.title, v_source.discount_cents,
    v_source.subtotal_cents, v_source.total_cents, v_source.notes, auth.uid()
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
