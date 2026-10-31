-- Gastos e horas. Financeiro é só de owner e admin: nem member nem técnico leem estas tabelas.
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  -- Categorias que o sistema usa por conta própria, como a de prestadores no pagamento de horas.
  system_key text check (system_key in ('payroll', 'contractors')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index expense_categories_name_idx on public.expense_categories (company_id, lower(name)) where deleted_at is null;
create unique index expense_categories_system_idx on public.expense_categories (company_id, system_key)
  where system_key is not null and deleted_at is null;

create table public.expense_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  description text not null check (length(description) between 2 and 160),
  category_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  employee_id uuid,
  day_of_month integer not null check (day_of_month between 1 and 28),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (company_id, category_id) references public.expense_categories (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index expense_templates_company_idx on public.expense_templates (company_id) where deleted_at is null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  description text not null check (length(description) between 2 and 200),
  category_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  expense_date date not null,
  kind text not null default 'one_off' check (kind in ('recurring', 'one_off', 'payroll', 'contractor')),
  employee_id uuid,
  template_id uuid,
  -- Primeiro dia do mês gerado. A chave vale também para apagados: excluir o lançamento de um
  -- mês não faz o job gerá-lo de novo.
  template_month date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (template_id, template_month),
  foreign key (company_id, category_id) references public.expense_categories (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  foreign key (company_id, template_id) references public.expense_templates (company_id, id)
);

create index expenses_company_date_idx on public.expenses (company_id, expense_date) where deleted_at is null;

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  entry_date date not null,
  starts_at time not null,
  ends_at time not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  visit_id uuid,
  client_id uuid,
  notes text,
  status text not null default 'approved' check (status in ('pending', 'approved', 'paid')),
  expense_id uuid,
  -- Copiado para a restrição EXCLUDE, que barra sobreposição por pessoa.
  time_range tsrange not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  foreign key (company_id, visit_id) references public.visits (company_id, id),
  foreign key (company_id, client_id) references public.clients (company_id, id),
  foreign key (company_id, expense_id) references public.expenses (company_id, id),
  constraint time_entries_no_overlap exclude using gist (
    employee_id extensions.gist_uuid_ops with =,
    time_range with &&
  ) where (deleted_at is null)
);

create index time_entries_month_idx on public.time_entries (company_id, entry_date) where deleted_at is null;
create unique index time_entries_one_per_visit_idx on public.time_entries (visit_id, employee_id)
  where visit_id is not null and deleted_at is null;

-- Sugestões retiradas do período. Tem linha aqui: a visita não sugere mais horas para a pessoa.
create table public.time_entry_dismissals (
  company_id uuid not null,
  visit_id uuid not null,
  employee_id uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (visit_id, employee_id),
  foreign key (company_id, visit_id) references public.visits (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create index time_entry_dismissals_company_idx on public.time_entry_dismissals (company_id);

create trigger set_expense_categories_updated_at before update on public.expense_categories
  for each row execute function public.set_updated_at();
create trigger set_expense_templates_updated_at before update on public.expense_templates
  for each row execute function public.set_updated_at();
create trigger set_expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();
create trigger set_time_entries_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expense_templates enable row level security;
alter table public.expenses enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_dismissals enable row level security;
revoke all on public.expense_categories, public.expense_templates, public.expenses, public.time_entries, public.time_entry_dismissals from anon, authenticated;
grant select, insert, update on public.expense_categories, public.expense_templates to authenticated;
-- Excluir gasto reabre horas, e horas têm regras próprias: escrita pelas funções abaixo.
grant select, insert, update on public.expenses to authenticated;
grant select on public.time_entries, public.time_entry_dismissals to authenticated;

-- Sem deleted_at na leitura: o Postgres aplica a policy de SELECT à linha nova de um UPDATE, e
-- o soft delete seria recusado. Os repositories filtram deleted_at.
do $$
declare
  t text;
begin
  foreach t in array array['expense_categories', 'expense_templates', 'expenses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_company_admin(company_id))', t || '_select_admin', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_company_admin(company_id))', t || '_insert_admin', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id))', t || '_update_admin', t);
  end loop;
end $$;

create policy "time_entries_select_admin" on public.time_entries
  for select to authenticated using (deleted_at is null and public.is_company_admin(company_id));
create policy "time_entry_dismissals_select_admin" on public.time_entry_dismissals
  for select to authenticated using (public.is_company_admin(company_id));

-- Categorias padrão de toda empresa, nova ou existente.
create or replace function public.seed_expense_categories(p_company_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.expense_categories (company_id, name, system_key)
  values
    (p_company_id, 'Funcionários', 'payroll'),
    (p_company_id, 'Prestadores (PJ e autônomos)', 'contractors'),
    (p_company_id, 'Aluguel', null),
    (p_company_id, 'Veículos e combustível', null),
    (p_company_id, 'Material', null),
    (p_company_id, 'Impostos', null),
    (p_company_id, 'Ferramentas e equipamentos', null),
    (p_company_id, 'Outros', null)
  on conflict do nothing;
$$;

create or replace function public.seed_new_company_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_expense_categories(new.id);
  return new;
end;
$$;

revoke execute on function public.seed_expense_categories(uuid), public.seed_new_company_categories() from public, anon, authenticated;

create trigger seed_new_company_categories
  after insert on public.companies
  for each row execute function public.seed_new_company_categories();

select public.seed_expense_categories(id) from public.companies;

-- Jornadas acima de 6 horas têm intervalo padrão de 1 hora.
create or replace function public.default_break_minutes(p_start time, p_end time)
returns integer
language sql
immutable
as $$
  select case when p_end - p_start > interval '6 hours' then 60 else 0 end;
$$;

revoke execute on function public.default_break_minutes(time, time) from public, anon, authenticated;

-- Visitas até hoje, não canceladas, sugerem horas para quem foi escalado e ainda não tem
-- apontamento. Com OS, valem os horários reais.
create or replace function public.suggested_time_entries(p_company_id uuid, p_month date)
returns table (
  visit_id uuid,
  employee_id uuid,
  entry_date date,
  starts_at time,
  ends_at time,
  break_minutes integer,
  client_id uuid,
  dismissed boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    v.id,
    ve.employee_id,
    v.visit_date,
    coalesce(w.started_time, v.starts_at),
    coalesce(w.finished_time, v.ends_at),
    public.default_break_minutes(coalesce(w.started_time, v.starts_at), coalesce(w.finished_time, v.ends_at)),
    v.client_id,
    d.visit_id is not null
  from public.visits v
  join public.visit_employees ve on ve.visit_id = v.id
  left join public.work_orders w on w.visit_id = v.id and w.deleted_at is null
  left join public.time_entry_dismissals d on d.visit_id = v.id and d.employee_id = ve.employee_id
  where v.company_id = p_company_id
    and v.deleted_at is null
    and v.status <> 'canceled'
    and v.visit_date >= p_month
    and v.visit_date < p_month + interval '1 month'
    and v.visit_date <= public.company_today(p_company_id)
    and coalesce(w.finished_time, v.ends_at) > coalesce(w.started_time, v.starts_at)
    and not exists (
      select 1 from public.time_entries te
      where te.visit_id = v.id and te.employee_id = ve.employee_id and te.deleted_at is null
    );
$$;

revoke execute on function public.suggested_time_entries(uuid, date) from public, anon, authenticated;

-- Pessoas, apontamentos e sugestões do mês, para a tela de horas.
create or replace function public.get_hours_month(p_company_id uuid, p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para acessar horas' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'active', e.active,
        'contract_type', coalesce(pd.contract_type, 'clt'),
        'hourly_pay_cents', coalesce(pd.hourly_pay_cents, 0)
      ) order by e.name)
      from public.employees e
      left join public.employee_payment_details pd on pd.employee_id = e.id
      where e.company_id = p_company_id and e.deleted_at is null
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', te.id, 'employee_id', te.employee_id, 'entry_date', te.entry_date,
        'starts_at', te.starts_at, 'ends_at', te.ends_at, 'break_minutes', te.break_minutes,
        'visit_id', te.visit_id, 'client_id', te.client_id,
        'client_name', c.name, 'location_name', l.name, 'notes', te.notes, 'status', te.status
      ) order by te.entry_date, te.starts_at)
      from public.time_entries te
      left join public.clients c on c.id = te.client_id
      left join public.visits v on v.id = te.visit_id
      left join public.client_locations l on l.id = v.location_id
      where te.company_id = p_company_id
        and te.deleted_at is null
        and te.entry_date >= p_month
        and te.entry_date < p_month + interval '1 month'
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visit_id', s.visit_id, 'employee_id', s.employee_id, 'entry_date', s.entry_date,
        'starts_at', s.starts_at, 'ends_at', s.ends_at, 'break_minutes', s.break_minutes,
        'client_id', s.client_id, 'client_name', c.name, 'location_name', l.name, 'dismissed', s.dismissed
      ) order by s.entry_date, s.starts_at)
      from public.suggested_time_entries(p_company_id, p_month) s
      join public.clients c on c.id = s.client_id
      join public.visits v on v.id = s.visit_id
      join public.client_locations l on l.id = v.location_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Cria ou ajusta um apontamento. Aceitar uma sugestão com ajuste passa por aqui, com a visita.
create or replace function public.save_time_entry(
  p_company_id uuid,
  p_entry_id uuid,
  p_employee_id uuid,
  p_entry_date date,
  p_starts_at time,
  p_ends_at time,
  p_break_minutes integer,
  p_visit_id uuid,
  p_client_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_entry_id;
  v_status text;
  v_range tsrange;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para alterar horas' using errcode = '42501';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'O horário de saída precisa ser depois da entrada.' using errcode = 'P0001';
  end if;
  if coalesce(p_break_minutes, 0) < 0
     or make_interval(mins => coalesce(p_break_minutes, 0)) >= p_ends_at - p_starts_at then
    raise exception 'O intervalo precisa ser menor que a jornada.' using errcode = 'P0001';
  end if;
  if p_entry_date > public.company_today(p_company_id) then
    raise exception 'Só dá para lançar horas até hoje.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and company_id = p_company_id and deleted_at is null) then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
  end if;

  v_range := tsrange(p_entry_date + p_starts_at, p_entry_date + p_ends_at, '[)');

  -- Sugestão da agenda ainda não é apontamento, mas será paga ao fechar: conflita desde já.
  if exists (
    select 1 from public.suggested_time_entries(p_company_id, date_trunc('month', p_entry_date)::date) s
    where s.employee_id = p_employee_id
      and not s.dismissed
      and s.visit_id is distinct from p_visit_id
      and tsrange(s.entry_date + s.starts_at, s.entry_date + s.ends_at, '[)') && v_range
  ) then
    raise exception 'Esta pessoa tem visita nesse horário. Ajuste ou retire a sugestão da agenda antes.' using errcode = 'P0001';
  end if;

  begin
    if v_id is null then
      insert into public.time_entries (
        company_id, employee_id, entry_date, starts_at, ends_at, break_minutes,
        visit_id, client_id, notes, time_range
      )
      values (
        p_company_id, p_employee_id, p_entry_date, p_starts_at, p_ends_at, coalesce(p_break_minutes, 0),
        p_visit_id, p_client_id, nullif(trim(p_notes), ''), v_range
      )
      returning id into v_id;
    else
      select status into v_status from public.time_entries
      where id = v_id and company_id = p_company_id and deleted_at is null
      for update;
      if not found then
        raise exception 'Apontamento não encontrado.' using errcode = 'P0001';
      end if;
      if v_status = 'paid' then
        raise exception 'Este apontamento já foi pago e não pode ser alterado.' using errcode = 'P0001';
      end if;
      update public.time_entries
      set entry_date = p_entry_date,
          starts_at = p_starts_at,
          ends_at = p_ends_at,
          break_minutes = coalesce(p_break_minutes, 0),
          client_id = coalesce(p_client_id, client_id),
          notes = nullif(trim(p_notes), ''),
          time_range = v_range
      where id = v_id;
    end if;
  exception
    when exclusion_violation then
      raise exception 'Esta pessoa já tem horas lançadas nesse horário.' using errcode = 'P0001';
    when unique_violation then
      raise exception 'Esta pessoa já tem apontamento nesta visita.' using errcode = 'P0001';
  end;

  return v_id;
end;
$$;

create or replace function public.set_time_entry_status(p_company_id uuid, p_entry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para alterar horas' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved') then
    raise exception 'Essa mudança de status não é permitida.' using errcode = 'P0001';
  end if;
  select status into v_status from public.time_entries
  where id = p_entry_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Apontamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_status = 'paid' then
    raise exception 'Este apontamento já foi pago e não pode ser alterado.' using errcode = 'P0001';
  end if;
  update public.time_entries set status = p_status where id = p_entry_id;
end;
$$;

-- Retirar um apontamento. Vindo de visita, ela não volta a sugerir horas para a pessoa.
create or replace function public.remove_time_entry(p_company_id uuid, p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.time_entries;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para alterar horas' using errcode = '42501';
  end if;
  select * into v_entry from public.time_entries
  where id = p_entry_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Apontamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_entry.status = 'paid' then
    raise exception 'Apontamentos pagos não podem ser excluídos. Exclua o pagamento em Gastos para reabrir.' using errcode = 'P0001';
  end if;
  update public.time_entries set deleted_at = now() where id = p_entry_id;
  if v_entry.visit_id is not null then
    insert into public.time_entry_dismissals (company_id, visit_id, employee_id)
    values (p_company_id, v_entry.visit_id, v_entry.employee_id)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.set_suggestion_dismissed(
  p_company_id uuid,
  p_visit_id uuid,
  p_employee_id uuid,
  p_dismissed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para alterar horas' using errcode = '42501';
  end if;
  if p_dismissed then
    insert into public.time_entry_dismissals (company_id, visit_id, employee_id)
    values (p_company_id, p_visit_id, p_employee_id)
    on conflict do nothing;
  else
    delete from public.time_entry_dismissals
    where company_id = p_company_id and visit_id = p_visit_id and employee_id = p_employee_id;
  end if;
end;
$$;

-- Fecha o mês de um prestador: paga o que está na lista, lança um gasto e marca como pago.
create or replace function public.close_contractor_month(p_company_id uuid, p_employee_id uuid, p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_contract text;
  v_rate integer;
  v_minutes integer;
  v_amount integer;
  v_category uuid;
  v_expense uuid;
  v_month_name text;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para fechar horas' using errcode = '42501';
  end if;

  select * into v_employee from public.employees
  where id = p_employee_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
  end if;

  select contract_type, hourly_pay_cents into v_contract, v_rate
  from public.employee_payment_details where employee_id = p_employee_id;
  if coalesce(v_contract, 'clt') = 'clt' then
    raise exception 'CLT não fecha horas: cadastre o salário em Gastos, nas recorrências.' using errcode = 'P0001';
  end if;
  if coalesce(v_rate, 0) <= 0 then
    raise exception 'Informe o valor pago por hora no cadastro da pessoa.' using errcode = 'P0001';
  end if;

  -- O que ainda é sugestão entra agora: a lista na tela é o que se paga.
  begin
    insert into public.time_entries (
      company_id, employee_id, entry_date, starts_at, ends_at, break_minutes, visit_id, client_id, time_range
    )
    select
      p_company_id, s.employee_id, s.entry_date, s.starts_at, s.ends_at, s.break_minutes, s.visit_id, s.client_id,
      tsrange(s.entry_date + s.starts_at, s.entry_date + s.ends_at, '[)')
    from public.suggested_time_entries(p_company_id, p_month) s
    where s.employee_id = p_employee_id and not s.dismissed;
  exception when exclusion_violation then
    raise exception 'Há horários sobrepostos nas horas de %. Ajuste antes de fechar.', v_employee.name using errcode = 'P0001';
  end;

  select coalesce(sum(
    (extract(epoch from (ends_at - starts_at)) / 60)::integer - break_minutes
  ), 0) into v_minutes
  from public.time_entries
  where company_id = p_company_id
    and employee_id = p_employee_id
    and status <> 'paid'
    and deleted_at is null
    and entry_date >= p_month
    and entry_date < p_month + interval '1 month';
  if v_minutes <= 0 then
    raise exception 'Nenhuma hora em aberto neste mês.' using errcode = 'P0001';
  end if;

  v_amount := round(v_minutes / 60.0 * v_rate);

  select id into v_category from public.expense_categories
  where company_id = p_company_id and system_key = 'contractors' and deleted_at is null;
  if v_category is null then
    perform public.seed_expense_categories(p_company_id);
    select id into v_category from public.expense_categories
    where company_id = p_company_id and system_key = 'contractors' and deleted_at is null;
  end if;

  v_month_name := (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month from p_month)::integer]
    || ' de ' || extract(year from p_month)::integer;

  insert into public.expenses (company_id, description, category_id, amount_cents, expense_date, kind, employee_id)
  values (
    p_company_id,
    'Prestação de serviços — ' || v_employee.name || ' (' || v_month_name || ')',
    v_category,
    v_amount,
    public.company_today(p_company_id),
    'contractor',
    p_employee_id
  )
  returning id into v_expense;

  update public.time_entries
  set status = 'paid', expense_id = v_expense
  where company_id = p_company_id
    and employee_id = p_employee_id
    and status <> 'paid'
    and deleted_at is null
    and entry_date >= p_month
    and entry_date < p_month + interval '1 month';

  return v_expense;
end;
$$;

-- Excluir um gasto. Se era pagamento de horas, elas voltam para aprovado e podem ser fechadas de novo.
create or replace function public.delete_expense(p_company_id uuid, p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para excluir gastos' using errcode = '42501';
  end if;
  update public.expenses set deleted_at = now()
  where id = p_expense_id and company_id = p_company_id and deleted_at is null;
  if not found then
    raise exception 'Gasto não encontrado.' using errcode = 'P0001';
  end if;
  update public.time_entries
  set status = 'approved', expense_id = null
  where expense_id = p_expense_id and company_id = p_company_id;
end;
$$;

-- Gera os lançamentos do mês. A chave única (modelo, mês) torna repetir inofensivo, e mês futuro
-- nunca gera. Modelo com funcionário gera folha.
create or replace function public.generate_month_expenses(p_company_id uuid, p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if date_trunc('month', p_month)::date > date_trunc('month', public.company_today(p_company_id))::date then
    return 0;
  end if;

  insert into public.expenses (
    company_id, description, category_id, amount_cents, expense_date, kind, employee_id, template_id, template_month
  )
  select
    t.company_id, t.description, t.category_id, t.amount_cents,
    date_trunc('month', p_month)::date + (t.day_of_month - 1),
    case when t.employee_id is null then 'recurring' else 'payroll' end,
    t.employee_id, t.id, date_trunc('month', p_month)::date
  from public.expense_templates t
  where t.company_id = p_company_id
    and t.active
    and t.deleted_at is null
    and date_trunc('month', t.starts_on) <= date_trunc('month', p_month)
    and (t.ends_on is null or date_trunc('month', t.ends_on) >= date_trunc('month', p_month))
  on conflict (template_id, template_month) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.generate_month_expenses(uuid, date) from public, anon, authenticated;

-- Pelo botão "Gerar recorrentes do mês".
create or replace function public.generate_expenses_now(p_company_id uuid, p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para gerar gastos' using errcode = '42501';
  end if;
  return public.generate_month_expenses(p_company_id, p_month);
end;
$$;

-- Job: roda todo dia porque o fuso é por empresa e um modelo novo pode surgir no meio do mês. A
-- chave única garante um lançamento por mês.
create or replace function public.generate_due_expenses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_total integer := 0;
begin
  for v_company in
    select distinct t.company_id
    from public.expense_templates t
    join public.companies c on c.id = t.company_id and c.deleted_at is null
    where t.active and t.deleted_at is null
  loop
    v_total := v_total + public.generate_month_expenses(v_company, public.company_today(v_company));
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.generate_due_expenses() from public, anon, authenticated;

select cron.schedule('generate-due-expenses', '17 4 * * *', 'select public.generate_due_expenses()');

-- OS concluída gera apontamentos pendentes para a equipe, sem duplicar. Quem já tem horas nesse
-- horário fica de fora aqui e continua como sugestão: a assinatura não pode falhar por isso.
create or replace function public.create_entries_from_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  select * into v_visit from public.visits where id = new.visit_id;

  insert into public.time_entries (
    company_id, employee_id, entry_date, starts_at, ends_at, break_minutes,
    visit_id, client_id, status, time_range
  )
  select
    new.company_id, ve.employee_id, v_visit.visit_date, new.started_time, new.finished_time,
    public.default_break_minutes(new.started_time, new.finished_time),
    new.visit_id, v_visit.client_id, 'pending',
    tsrange(v_visit.visit_date + new.started_time, v_visit.visit_date + new.finished_time, '[)')
  from public.visit_employees ve
  where ve.visit_id = new.visit_id
    and not exists (
      select 1 from public.time_entries te
      where te.employee_id = ve.employee_id
        and te.deleted_at is null
        and (
          te.visit_id = new.visit_id
          or te.time_range && tsrange(v_visit.visit_date + new.started_time, v_visit.visit_date + new.finished_time, '[)')
        )
    );
  return new;
end;
$$;

revoke execute on function public.create_entries_from_work_order() from public, anon, authenticated;

create trigger create_entries_from_work_order
  after update of status on public.work_orders
  for each row execute function public.create_entries_from_work_order();

revoke execute on function
  public.get_hours_month(uuid, date),
  public.save_time_entry(uuid, uuid, uuid, date, time, time, integer, uuid, uuid, text),
  public.set_time_entry_status(uuid, uuid, text),
  public.remove_time_entry(uuid, uuid),
  public.set_suggestion_dismissed(uuid, uuid, uuid, boolean),
  public.close_contractor_month(uuid, uuid, date),
  public.delete_expense(uuid, uuid),
  public.generate_expenses_now(uuid, date)
from public, anon;

grant execute on function
  public.get_hours_month(uuid, date),
  public.save_time_entry(uuid, uuid, uuid, date, time, time, integer, uuid, uuid, text),
  public.set_time_entry_status(uuid, uuid, text),
  public.remove_time_entry(uuid, uuid),
  public.set_suggestion_dismissed(uuid, uuid, uuid, boolean),
  public.close_contractor_month(uuid, uuid, date),
  public.delete_expense(uuid, uuid),
  public.generate_expenses_now(uuid, date)
to authenticated;
