-- Clientes da empresa, com contatos e locais de atendimento. O técnico não lê estas tabelas:
-- quando precisar, recebe só o que a visita dele exige, por RPC.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(name) between 2 and 160),
  document text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index clients_company_name_idx on public.clients (company_id, name) where deleted_at is null;

-- FK composta: contato e local nunca apontam para cliente de outra empresa.
create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_id uuid not null,
  name text not null check (length(name) between 2 and 160),
  role text,
  phone text,
  email text,
  is_primary boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, client_id) references public.clients (company_id, id) on delete cascade
);

create index client_contacts_client_idx on public.client_contacts (company_id, client_id) where deleted_at is null;
create unique index client_contacts_one_primary_idx
  on public.client_contacts (client_id)
  where is_primary and deleted_at is null;

create table public.client_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_id uuid not null,
  name text not null check (length(name) between 2 and 120),
  address text not null check (length(address) between 5 and 300),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, client_id) references public.clients (company_id, id) on delete cascade,
  unique (company_id, id)
);

create index client_locations_client_idx on public.client_locations (company_id, client_id) where deleted_at is null;

-- Marcar um contato como principal desmarca o anterior, na mesma transação.
create or replace function public.keep_single_primary_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_primary and new.deleted_at is null then
    update public.client_contacts
    set is_primary = false
    where client_id = new.client_id
      and id <> new.id
      and is_primary
      and deleted_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_single_primary_contact() from public, anon, authenticated;

create trigger keep_single_primary_contact
  before insert or update of is_primary, deleted_at on public.client_contacts
  for each row execute function public.keep_single_primary_contact();

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'client_contacts', 'client_locations'] loop
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
    execute format(
      'create trigger guard_%1$s_soft_delete before update of deleted_at on public.%1$I
         for each row execute function public.guard_soft_delete()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    -- Sem deleted_at na leitura: o Postgres aplica esta policy à linha nova de um UPDATE, e
    -- o soft delete seria recusado. Os repositories filtram deleted_at, como no restante do kit.
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated
         using (public.is_company_office(company_id))',
      t || '_select_office', t);
    execute format(
      'create policy %1$I on public.%2$I for insert to authenticated
         with check (deleted_at is null and public.is_company_office(company_id))',
      t || '_insert_office', t);
    -- O with check não exige deleted_at null: o soft delete precisa passar, e quem pode
    -- apagar é decidido por guard_soft_delete.
    execute format(
      'create policy %1$I on public.%2$I for update to authenticated
         using (deleted_at is null and public.is_company_office(company_id))
         with check (public.is_company_office(company_id))',
      t || '_update_office', t);
  end loop;
end $$;
