-- Equipe e agenda. Nem toda pessoa da equipe tem login: user_id é opcional e é o que dá ao
-- técnico acesso às próprias visitas.
create extension if not exists btree_gist with schema extensions;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(name) between 2 and 160),
  job_title text,
  active boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create index employees_company_idx on public.employees (company_id, name) where deleted_at is null;
create unique index employees_one_per_user_idx on public.employees (company_id, user_id)
  where user_id is not null and deleted_at is null;

-- RLS filtra linhas, não colunas: telefone, contrato e pagamento ficam aqui, só para owner e admin.
create table public.employee_payment_details (
  employee_id uuid primary key,
  company_id uuid not null,
  phone text,
  contract_type text not null default 'clt' check (contract_type in ('clt', 'pj', 'freelancer')),
  hourly_cost_cents integer not null default 0 check (hourly_cost_cents >= 0),
  hourly_pay_cents integer not null default 0 check (hourly_pay_cents >= 0),
  legal_name text,
  tax_id text,
  pix_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);

create index employee_payment_details_company_idx on public.employee_payment_details (company_id);

-- O usuário vinculado precisa ser membro ativo da mesma empresa.
create or replace function public.check_employee_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.company_members
    where company_id = new.company_id and user_id = new.user_id and deleted_at is null
  ) then
    raise exception 'O usuário vinculado não é membro desta empresa.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_employee_user() from public, anon, authenticated;

create trigger check_employee_user
  before insert or update of user_id on public.employees
  for each row execute function public.check_employee_user();

create trigger set_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();
create trigger set_employee_payment_details_updated_at
  before update on public.employee_payment_details
  for each row execute function public.set_updated_at();

alter table public.employees enable row level security;
alter table public.employee_payment_details enable row level security;
revoke all on public.employees, public.employee_payment_details from anon, authenticated;
grant select, insert, update on public.employees, public.employee_payment_details to authenticated;

-- Sem deleted_at na leitura: o Postgres aplica a policy de SELECT à linha nova de um UPDATE, e
-- o soft delete seria recusado. Os repositories filtram deleted_at.
create policy "employees_select_office" on public.employees
  for select to authenticated using (public.is_company_office(company_id));
create policy "employees_insert_admin" on public.employees
  for insert to authenticated with check (public.is_company_admin(company_id));
create policy "employees_update_admin" on public.employees
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

create policy "employee_payment_details_select_admin" on public.employee_payment_details
  for select to authenticated using (public.is_company_admin(company_id));
create policy "employee_payment_details_insert_admin" on public.employee_payment_details
  for insert to authenticated with check (public.is_company_admin(company_id));
create policy "employee_payment_details_update_admin" on public.employee_payment_details
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Data + hora local da empresa, sem fuso.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  location_id uuid not null,
  quote_id uuid,
  kind text not null check (kind in ('assessment', 'execution')),
  visit_date date not null,
  starts_at time not null,
  ends_at time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'canceled')),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (company_id, id),
  foreign key (company_id, client_id) references public.clients (company_id, id),
  foreign key (company_id, location_id) references public.client_locations (company_id, id),
  foreign key (company_id, quote_id) references public.quotes (company_id, id)
);

create index visits_company_date_idx on public.visits (company_id, visit_date) where deleted_at is null;
create index visits_client_idx on public.visits (company_id, client_id) where deleted_at is null;
create index visits_location_idx on public.visits (company_id, location_id) where deleted_at is null;
create index visits_quote_idx on public.visits (company_id, quote_id) where deleted_at is null;

-- time_range e blocks_schedule copiam dados da visita, porque uma restrição EXCLUDE só enxerga
-- a própria tabela. Assim a sobreposição é barrada mesmo com dois usuários salvando juntos.
create table public.visit_employees (
  company_id uuid not null,
  visit_id uuid not null,
  employee_id uuid not null,
  time_range tsrange not null,
  blocks_schedule boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (visit_id, employee_id),
  foreign key (company_id, visit_id) references public.visits (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  constraint visit_employees_no_overlap exclude using gist (
    employee_id extensions.gist_uuid_ops with =,
    time_range with &&
  ) where (blocks_schedule)
);

create index visit_employees_employee_idx on public.visit_employees (company_id, employee_id);

create or replace function public.sync_visit_employees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.visit_employees
  set time_range = tsrange(new.visit_date + new.starts_at, new.visit_date + new.ends_at, '[)'),
      blocks_schedule = new.status in ('scheduled', 'in_progress') and new.deleted_at is null
  where visit_id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_visit_employees() from public, anon, authenticated;

create trigger sync_visit_employees
  after update of visit_date, starts_at, ends_at, status, deleted_at on public.visits
  for each row execute function public.sync_visit_employees();

create trigger set_visits_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- A visita é do técnico logado? O vínculo só vale enquanto ele for membro da empresa.
create or replace function public.is_my_visit(p_visit_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.visit_employees ve
    join public.employees e on e.id = ve.employee_id and e.deleted_at is null
    join public.company_members cm
      on cm.company_id = e.company_id and cm.user_id = e.user_id and cm.deleted_at is null
    where ve.visit_id = p_visit_id
      and e.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_my_visit(uuid) from public, anon;
grant execute on function public.is_my_visit(uuid) to authenticated;

alter table public.visits enable row level security;
alter table public.visit_employees enable row level security;
revoke all on public.visits, public.visit_employees from anon, authenticated;
grant select on public.visits, public.visit_employees to authenticated;

create policy "visits_select" on public.visits
  for select to authenticated
  using (deleted_at is null and (public.is_company_office(company_id) or public.is_my_visit(id)));
create policy "visit_employees_select" on public.visit_employees
  for select to authenticated
  using (public.is_company_office(company_id) or public.is_my_visit(visit_id));

-- Cria ou altera uma visita e a equipe dela, na mesma transação.
create or replace function public.save_visit(
  p_company_id uuid,
  p_visit_id uuid,
  p_client_id uuid,
  p_location_id uuid,
  p_quote_id uuid,
  p_kind text,
  p_visit_date date,
  p_starts_at time,
  p_ends_at time,
  p_status text,
  p_notes text,
  p_employee_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_id uuid := p_visit_id;
  v_previous uuid[] := '{}';
  v_blocks boolean := p_status in ('scheduled', 'in_progress');
  v_range tsrange;
  v_conflict text;
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para alterar a agenda' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'Escolha o cliente.' using errcode = 'P0001';
  end if;
  if p_location_id is null then
    raise exception 'Escolha o local da visita.' using errcode = 'P0001';
  end if;
  if p_visit_date is null then
    raise exception 'Informe a data.' using errcode = 'P0001';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'O horário de término precisa ser depois do início.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_employee_ids, 1), 0) = 0 then
    raise exception 'Escolha ao menos uma pessoa da equipe.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.client_locations
    where id = p_location_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null
  ) then
    raise exception 'O local não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if p_quote_id is not null and not exists (
    select 1 from public.quotes
    where id = p_quote_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null
  ) then
    raise exception 'O orçamento não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if v_visit_id is not null then
    perform 1 from public.visits
    where id = v_visit_id and company_id = p_company_id and deleted_at is null
    for update;
    if not found then
      raise exception 'Visita não encontrada.' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(employee_id), '{}') into v_previous
    from public.visit_employees where visit_id = v_visit_id;
  end if;

  -- Quem já estava na visita pode ter sido desativado depois; quem entra agora precisa estar ativo.
  if exists (
    select 1 from unnest(p_employee_ids) as chosen(id)
    left join public.employees e
      on e.id = chosen.id and e.company_id = p_company_id and e.deleted_at is null
    where e.id is null or (not e.active and not chosen.id = any (v_previous))
  ) then
    raise exception 'Escolha apenas pessoas ativas da equipe.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.employees where id = any (p_employee_ids) and active
  ) then
    raise exception 'Escolha ao menos uma pessoa ativa da equipe.' using errcode = 'P0001';
  end if;

  v_range := tsrange(p_visit_date + p_starts_at, p_visit_date + p_ends_at, '[)');

  -- Mensagem com o nome de quem conflita; a restrição EXCLUDE segura o caso concorrente.
  if v_blocks then
    select e.name into v_conflict
    from public.visit_employees ve
    join public.employees e on e.id = ve.employee_id
    where ve.company_id = p_company_id
      and ve.employee_id = any (p_employee_ids)
      and ve.blocks_schedule
      and ve.time_range && v_range
      and ve.visit_id is distinct from v_visit_id
    limit 1;
    if v_conflict is not null then
      raise exception '% já está em outra visita nesse horário.', v_conflict using errcode = 'P0001';
    end if;
  end if;

  begin
    if v_visit_id is null then
      insert into public.visits (
        company_id, client_id, location_id, quote_id, kind, visit_date,
        starts_at, ends_at, status, notes, created_by
      )
      values (
        p_company_id, p_client_id, p_location_id, p_quote_id, p_kind, p_visit_date,
        p_starts_at, p_ends_at, p_status, nullif(trim(p_notes), ''), auth.uid()
      )
      returning id into v_visit_id;
    else
      -- Tira os que saíram antes de mudar o horário, para não conflitar à toa.
      delete from public.visit_employees
      where visit_id = v_visit_id and not employee_id = any (p_employee_ids);

      update public.visits
      set client_id = p_client_id,
          location_id = p_location_id,
          quote_id = p_quote_id,
          kind = p_kind,
          visit_date = p_visit_date,
          starts_at = p_starts_at,
          ends_at = p_ends_at,
          status = p_status,
          notes = nullif(trim(p_notes), '')
      where id = v_visit_id;
    end if;

    insert into public.visit_employees (company_id, visit_id, employee_id, time_range, blocks_schedule)
    select p_company_id, v_visit_id, chosen.id, v_range, v_blocks
    from unnest(p_employee_ids) as chosen(id)
    on conflict (visit_id, employee_id) do nothing;
  exception when exclusion_violation then
    raise exception 'Alguém da equipe acabou de ser escalado em outra visita nesse horário. Revise e tente de novo.' using errcode = 'P0001';
  end;

  return v_visit_id;
end;
$$;

create or replace function public.delete_visit(p_company_id uuid, p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só owner e admin excluem visitas' using errcode = '42501';
  end if;
  update public.visits set deleted_at = now()
  where id = p_visit_id and company_id = p_company_id and deleted_at is null;
  if not found then
    raise exception 'Visita não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function
  public.save_visit(uuid, uuid, uuid, uuid, uuid, text, date, time, time, text, text, uuid[]),
  public.delete_visit(uuid, uuid)
from public, anon;

grant execute on function
  public.save_visit(uuid, uuid, uuid, uuid, uuid, text, date, time, time, text, text, uuid[]),
  public.delete_visit(uuid, uuid)
to authenticated;
