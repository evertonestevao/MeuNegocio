-- Dados da empresa usados em orçamentos e no PDF. Todo papel lê, porque o documento precisa
-- deles; só owner e admin editam.
create table public.company_profiles (
  company_id uuid primary key references public.companies (id) on delete cascade,
  cnpj text,
  phone text,
  email text,
  address text,
  quote_validity_days integer not null default 15 check (quote_validity_days >= 1),
  quote_default_notes text,
  timezone text not null default 'America/Sao_Paulo',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_company_profiles_updated_at
  before update on public.company_profiles
  for each row execute function public.set_updated_at();

alter table public.company_profiles enable row level security;
revoke all on public.company_profiles from anon, authenticated;
grant select, insert, update on public.company_profiles to authenticated;

create policy "company_profiles_select_member" on public.company_profiles
  for select to authenticated using (public.is_company_member(company_id));
create policy "company_profiles_insert_admin" on public.company_profiles
  for insert to authenticated with check (public.is_company_admin(company_id));
create policy "company_profiles_update_admin" on public.company_profiles
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Catálogo: o escritório vê e usa; só owner e admin editam.
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('product', 'service')),
  name text not null check (length(name) between 2 and 160),
  description text,
  unit text not null check (length(unit) between 1 and 20),
  pricing_mode text not null default 'fixed' check (pricing_mode in ('fixed', 'hourly')),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index catalog_items_company_idx on public.catalog_items (company_id, kind, name) where deleted_at is null;

-- RLS filtra linhas, não colunas: o custo fica em tabela própria, só para owner e admin.
create table public.catalog_item_costs (
  catalog_item_id uuid primary key,
  company_id uuid not null,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, catalog_item_id) references public.catalog_items (company_id, id) on delete cascade
);

create index catalog_item_costs_company_idx on public.catalog_item_costs (company_id);

create trigger set_catalog_items_updated_at
  before update on public.catalog_items
  for each row execute function public.set_updated_at();
create trigger set_catalog_item_costs_updated_at
  before update on public.catalog_item_costs
  for each row execute function public.set_updated_at();

alter table public.catalog_items enable row level security;
alter table public.catalog_item_costs enable row level security;
revoke all on public.catalog_items, public.catalog_item_costs from anon, authenticated;
grant select, insert, update on public.catalog_items, public.catalog_item_costs to authenticated;

-- Sem deleted_at na leitura: o Postgres aplica a policy de SELECT à linha nova de um UPDATE, e
-- o soft delete seria recusado. Os repositories filtram deleted_at.
create policy "catalog_items_select_office" on public.catalog_items
  for select to authenticated using (public.is_company_office(company_id));
create policy "catalog_items_insert_admin" on public.catalog_items
  for insert to authenticated with check (public.is_company_admin(company_id));
create policy "catalog_items_update_admin" on public.catalog_items
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

create policy "catalog_item_costs_select_admin" on public.catalog_item_costs
  for select to authenticated using (public.is_company_admin(company_id));
create policy "catalog_item_costs_insert_admin" on public.catalog_item_costs
  for insert to authenticated with check (public.is_company_admin(company_id));
create policy "catalog_item_costs_update_admin" on public.catalog_item_costs
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));
