-- Orçamentos. O client só lê estas tabelas: toda escrita passa pelas funções abaixo, que
-- concentram numeração, cálculo e transições de status. Assim a regra vale mesmo para quem
-- chamar a API do banco sem passar pela aplicação.
create table public.company_counters (
  company_id uuid primary key references public.companies (id) on delete cascade,
  quote_number integer not null default 0
);
alter table public.company_counters enable row level security;
revoke all on public.company_counters from anon, authenticated;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number integer not null,
  client_id uuid,
  location_id uuid,
  title text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'refused', 'expired', 'closed')),
  valid_until date,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  public_token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  sent_at timestamptz,
  approved_at timestamptz,
  refused_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, number),
  unique (company_id, id),
  foreign key (company_id, client_id) references public.clients (company_id, id),
  foreign key (company_id, location_id) references public.client_locations (company_id, id)
);

create index quotes_company_status_idx on public.quotes (company_id, status) where deleted_at is null;
create index quotes_client_idx on public.quotes (company_id, client_id) where deleted_at is null;
create index quotes_location_idx on public.quotes (company_id, location_id) where deleted_at is null;
create index quotes_due_idx on public.quotes (valid_until) where status = 'sent' and deleted_at is null;

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quote_id uuid not null,
  catalog_item_id uuid,
  sort_order integer not null default 0,
  description text not null check (length(description) between 1 and 300),
  unit text not null,
  pricing_mode text not null check (pricing_mode in ('fixed', 'hourly')),
  quantity numeric(12, 3) not null check (quantity > 0),
  people integer not null default 1 check (people >= 1),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, quote_id) references public.quotes (company_id, id) on delete cascade,
  foreign key (company_id, catalog_item_id) references public.catalog_items (company_id, id)
);

create index quote_items_quote_idx on public.quote_items (company_id, quote_id, sort_order);

create table public.quote_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quote_id uuid not null,
  decision text not null check (decision in ('approved', 'refused')),
  name text not null,
  comment text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, quote_id) references public.quotes (company_id, id) on delete cascade
);

create index quote_responses_quote_idx on public.quote_responses (company_id, quote_id);

-- Receita: nasce ao fechar um orçamento. Financeiro é só de owner e admin.
create table public.revenues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quote_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  competence_date date not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, quote_id) references public.quotes (company_id, id) on delete cascade
);

create unique index revenues_one_active_per_quote_idx on public.revenues (quote_id) where deleted_at is null;
create index revenues_company_date_idx on public.revenues (company_id, competence_date) where deleted_at is null;

create trigger set_quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_responses enable row level security;
alter table public.revenues enable row level security;
revoke all on public.quotes, public.quote_items, public.quote_responses, public.revenues from anon, authenticated;
grant select on public.quotes, public.quote_items, public.quote_responses, public.revenues to authenticated;

create policy "quotes_select_office" on public.quotes
  for select to authenticated using (deleted_at is null and public.is_company_office(company_id));
create policy "quote_items_select_office" on public.quote_items
  for select to authenticated using (deleted_at is null and public.is_company_office(company_id));
create policy "quote_responses_select_office" on public.quote_responses
  for select to authenticated using (deleted_at is null and public.is_company_office(company_id));
create policy "revenues_select_admin" on public.revenues
  for select to authenticated using (deleted_at is null and public.is_company_admin(company_id));

-- Data de hoje no fuso da empresa.
create or replace function public.company_today(p_company_id uuid)
returns date
language sql
security definer
set search_path = public
stable
as $$
  select (now() at time zone coalesce(
    (select timezone from public.company_profiles where company_id = p_company_id),
    'America/Sao_Paulo'
  ))::date;
$$;

revoke execute on function public.company_today(uuid) from public, anon;
grant execute on function public.company_today(uuid) to authenticated;

-- Cria ou atualiza um rascunho, com os itens e os totais na mesma transação.
create or replace function public.save_quote(
  p_company_id uuid,
  p_quote_id uuid,
  p_client_id uuid,
  p_location_id uuid,
  p_title text,
  p_valid_until date,
  p_discount_cents integer,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid := p_quote_id;
  v_number integer;
  v_status text;
  v_subtotal bigint;
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
    insert into public.company_counters (company_id, quote_number)
    values (p_company_id, 1)
    on conflict (company_id) do update set quote_number = public.company_counters.quote_number + 1
    returning quote_number into v_number;

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
$$;

-- Transições que o escritório pode fazer. Fechar e desfazer têm funções próprias.
create or replace function public.transition_quote(
  p_company_id uuid,
  p_quote_id uuid,
  p_action text,
  p_valid_until date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_valid date;
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para alterar orçamentos' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;

  if p_action = 'send' and v_quote.status = 'draft' then
    if v_quote.client_id is null then
      raise exception 'Escolha o cliente.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
      raise exception 'Adicione pelo menos um item.' using errcode = 'P0001';
    end if;
    v_valid := coalesce(
      v_quote.valid_until,
      public.company_today(p_company_id) + coalesce(
        (select quote_validity_days from public.company_profiles where company_id = p_company_id), 15
      )
    );
    if v_valid < public.company_today(p_company_id) then
      raise exception 'A validade já passou. Informe uma nova data.' using errcode = 'P0001';
    end if;
    update public.quotes set status = 'sent', sent_at = now(), valid_until = v_valid where id = p_quote_id;
  elsif p_action = 'approve' and v_quote.status = 'sent' then
    update public.quotes set status = 'approved', approved_at = now() where id = p_quote_id;
  elsif p_action = 'refuse' and v_quote.status in ('draft', 'sent') then
    update public.quotes set status = 'refused', refused_at = now() where id = p_quote_id;
  elsif p_action = 'expire' and v_quote.status = 'sent' then
    update public.quotes set status = 'expired' where id = p_quote_id;
  elsif p_action = 'reopen' and v_quote.status = 'expired' then
    if p_valid_until is null or p_valid_until < public.company_today(p_company_id) then
      raise exception 'Informe uma nova validade, a partir de hoje.' using errcode = 'P0001';
    end if;
    update public.quotes set status = 'draft', sent_at = null, valid_until = p_valid_until where id = p_quote_id;
  else
    raise exception 'Essa mudança de status não é permitida.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.close_quote(
  p_company_id uuid,
  p_quote_id uuid,
  p_amount_cents integer,
  p_competence_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
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
end;
$$;

create or replace function public.undo_close_quote(p_company_id uuid, p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só owner e admin desfazem o fechamento' using errcode = '42501';
  end if;

  select status into v_status from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_status <> 'closed' then
    raise exception 'Este orçamento não está fechado.' using errcode = 'P0001';
  end if;

  update public.revenues set deleted_at = now() where quote_id = p_quote_id and deleted_at is null;
  update public.quotes set status = 'approved', closed_at = null where id = p_quote_id;
end;
$$;

-- Duplicar sempre cria um rascunho novo, com número e link próprios.
create or replace function public.duplicate_quote(p_company_id uuid, p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.company_counters (company_id, quote_number)
  values (p_company_id, 1)
  on conflict (company_id) do update set quote_number = public.company_counters.quote_number + 1
  returning quote_number into v_number;

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

  return v_new_id;
end;
$$;

create or replace function public.delete_quote(p_company_id uuid, p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só owner e admin excluem orçamentos' using errcode = '42501';
  end if;

  select status into v_status from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_status in ('approved', 'closed') then
    raise exception 'Orçamentos aprovados ou fechados não podem ser excluídos.' using errcode = 'P0001';
  end if;
  if v_status = 'sent' then
    raise exception 'Este orçamento está com o cliente. Marque como recusado ou expirado antes de excluir.' using errcode = 'P0001';
  end if;

  update public.quotes set deleted_at = now() where id = p_quote_id;
end;
$$;

-- Link público: só o servidor chama, com service_role. Devolve apenas o que o cliente vê.
create or replace function public.get_public_quote(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
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
      select jsonb_build_object('decision', r.decision, 'name', r.name, 'comment', r.comment, 'created_at', r.created_at)
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
$$;

create or replace function public.respond_public_quote(
  p_token text,
  p_decision text,
  p_name text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  if p_decision not in ('approved', 'refused') then
    raise exception 'Resposta inválida.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if p_decision = 'refused' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Conte o motivo da recusa.' using errcode = 'P0001';
  end if;

  select * into v_quote from public.quotes
  where public_token = p_token and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Este orçamento não aceita mais respostas.' using errcode = 'P0001';
  end if;
  if v_quote.valid_until < public.company_today(v_quote.company_id) then
    raise exception 'A validade deste orçamento terminou. Fale com a empresa.' using errcode = 'P0001';
  end if;

  insert into public.quote_responses (company_id, quote_id, decision, name, comment)
  values (v_quote.company_id, v_quote.id, p_decision, trim(p_name), nullif(trim(p_comment), ''));

  if p_decision = 'approved' then
    update public.quotes set status = 'approved', approved_at = now() where id = v_quote.id;
  else
    update public.quotes set status = 'refused', refused_at = now() where id = v_quote.id;
  end if;

  return jsonb_build_object('company_id', v_quote.company_id, 'quote_id', v_quote.id);
end;
$$;

-- Expira enviados vencidos. Roda de hora em hora porque o dia muda conforme o fuso de cada
-- empresa; só pega quem ainda está como enviado, então repetir não tem efeito.
create or replace function public.expire_due_quotes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.quotes q
  set status = 'expired'
  where q.status = 'sent'
    and q.deleted_at is null
    and q.valid_until < public.company_today(q.company_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function
  public.save_quote(uuid, uuid, uuid, uuid, text, date, integer, text, jsonb),
  public.transition_quote(uuid, uuid, text, date),
  public.close_quote(uuid, uuid, integer, date),
  public.undo_close_quote(uuid, uuid),
  public.duplicate_quote(uuid, uuid),
  public.delete_quote(uuid, uuid)
from public, anon;

grant execute on function
  public.save_quote(uuid, uuid, uuid, uuid, text, date, integer, text, jsonb),
  public.transition_quote(uuid, uuid, text, date),
  public.close_quote(uuid, uuid, integer, date),
  public.undo_close_quote(uuid, uuid),
  public.duplicate_quote(uuid, uuid),
  public.delete_quote(uuid, uuid)
to authenticated;

revoke execute on function
  public.get_public_quote(text),
  public.respond_public_quote(text, text, text, text),
  public.expire_due_quotes()
from public, anon, authenticated;

grant execute on function
  public.get_public_quote(text),
  public.respond_public_quote(text, text, text, text)
to service_role;

create extension if not exists pg_cron;

select cron.schedule('expire-due-quotes', '5 * * * *', 'select public.expire_due_quotes()');
