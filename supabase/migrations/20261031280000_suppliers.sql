-- Fornecedores da empresa e forma de pagamento dos gastos. O nome digitado no gasto vira
-- cadastro; os gastos que já tinham o fornecedor como texto passam a apontar para o cadastro.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  document text check (document is null or length(document) between 11 and 20),
  phone text check (phone is null or length(phone) <= 30),
  notes text check (notes is null or length(notes) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

-- Um nome por empresa, sem diferença de maiúsculas: é o que evita "Casa do Eletricista" duas vezes.
create unique index suppliers_company_name_key on public.suppliers (company_id, lower(name)) where deleted_at is null;

create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

-- Fornecedor e quanto se paga a ele são dados do financeiro: só owner e admin.
create policy "suppliers_select_admin" on public.suppliers
  for select to authenticated using (public.is_company_admin(company_id));
create policy "suppliers_insert_admin" on public.suppliers
  for insert to authenticated with check (public.is_company_admin(company_id));
create policy "suppliers_update_admin" on public.suppliers
  for update to authenticated using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

grant select, insert, update on public.suppliers to authenticated;

alter table public.expenses
  add column supplier_id uuid,
  add column payment_method text check (payment_method in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other')),
  add constraint expenses_supplier_fkey foreign key (company_id, supplier_id) references public.suppliers (company_id, id);

create index expenses_supplier_idx on public.expenses (supplier_id) where supplier_id is not null and deleted_at is null;

insert into public.suppliers (company_id, name)
select distinct on (company_id, lower(trim(supplier))) company_id, trim(supplier)
from public.expenses
where supplier is not null and length(trim(supplier)) >= 2
order by company_id, lower(trim(supplier)), created_at
on conflict (company_id, lower(name)) where deleted_at is null do nothing;

update public.expenses e
set supplier_id = s.id
from public.suppliers s
where s.company_id = e.company_id and s.deleted_at is null and lower(s.name) = lower(trim(e.supplier));

alter table public.expenses drop column supplier;
