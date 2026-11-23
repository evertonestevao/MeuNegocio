-- Contas a pagar: cada gasto ganha as suas parcelas, com vencimento e data de pagamento.
--
-- O gasto (expenses) continua sendo a compra: a data dele (expense_date) é a data do gasto, a que
-- conta no resultado do mês, no custo do serviço e nas contas por fornecedor. As parcelas dizem quando
-- o dinheiro sai: cada uma tem vencimento (due_date) e, depois de paga, a data do pagamento (paid_on).
--
-- Regras:
--   * Todo gasto tem ao menos uma parcela, e as parcelas somam o valor do gasto.
--   * Gasto lançado sem parcelas (recorrências geradas, folha, prestador, ou qualquer inserção que não
--     passe por save_expense) ganha uma parcela automática, no valor todo e com vencimento na data do
--     gasto. Gerados (recorrente, folha, prestador) continuam como antes: contam como pagos na data
--     deles. O pontual fica pago se a data já chegou e a pagar se é futura.
--   * Gasto com mais de uma parcela e alguma já paga não muda de valor nem de parcelas: é preciso
--     desfazer os pagamentos antes.
--   * Os gastos que já existem recebem a parcela pela mesma regra: o que já aconteceu fica pago na data
--     que está lá; o que tem data futura fica a pagar nessa data (era assim que o início e o fluxo de
--     caixa já os tratavam).
--
-- Escrita só pelas funções abaixo (security definer, conferindo owner ou admin da empresa). A leitura
-- segue a mesma regra de expenses: só owner e admin.

create table public.expense_installments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  expense_id uuid not null,
  number smallint not null check (number between 1 and 60),
  due_date date not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, expense_id) references public.expenses (company_id, id)
);

create unique index expense_installments_number_idx on public.expense_installments (expense_id, number) where deleted_at is null;
create index expense_installments_open_idx on public.expense_installments (company_id, due_date) where deleted_at is null and paid_on is null;
create index expense_installments_paid_idx on public.expense_installments (company_id, paid_on) where deleted_at is null and paid_on is not null;

create trigger set_expense_installments_updated_at before update on public.expense_installments
  for each row execute function public.set_updated_at();

alter table public.expense_installments enable row level security;
revoke all on public.expense_installments from anon, authenticated;
grant select on public.expense_installments to authenticated;

create policy "expense_installments_select_admin" on public.expense_installments
  for select to authenticated using (public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Parcela automática para gasto lançado sem parcelas. save_expense liga a variável da transação e
-- monta as parcelas ele mesmo.
-- ---------------------------------------------------------------------------
create or replace function public.expense_default_installment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.expense_installments_manual', true), '') = 'on' then
    return new;
  end if;
  insert into public.expense_installments (company_id, expense_id, number, due_date, amount_cents, paid_on)
  values (
    new.company_id, new.id, 1, new.expense_date, new.amount_cents,
    case when new.kind <> 'one_off' or new.expense_date <= public.company_today(new.company_id) then new.expense_date end
  );
  return new;
end;
$$;

revoke execute on function public.expense_default_installment() from public, anon, authenticated;

create trigger expense_default_installment
  after insert on public.expenses
  for each row execute function public.expense_default_installment();

-- Gasto e parcelas andam juntos: a escrita direta em expenses sai, e tudo passa por save_expense,
-- delete_expense e pelas funções das recorrências e das horas (que já gravavam como dono).
revoke insert, update on public.expenses from authenticated;

-- Gastos que já existem: uma parcela cada, pela mesma regra.
insert into public.expense_installments (company_id, expense_id, number, due_date, amount_cents, paid_on)
select e.company_id, e.id, 1, e.expense_date, e.amount_cents,
       case when e.kind <> 'one_off' or e.expense_date <= public.company_today(e.company_id) then e.expense_date end
from public.expenses e
where e.deleted_at is null
  and not exists (select 1 from public.expense_installments i where i.expense_id = e.id and i.deleted_at is null);

-- ---------------------------------------------------------------------------
-- Salvar o gasto e as parcelas numa transação só.
--   p_expense: description, category_id, amount_cents, expense_date, employee_id, notes, quote_id,
--              supplier_id, payment_method (como na tela).
--   p_installments: [{ due_date, amount_cents, paid_on }] na ordem, ou null para manter as parcelas.
-- ---------------------------------------------------------------------------
create or replace function public.save_expense(
  p_company_id uuid,
  p_expense_id uuid,
  p_expense jsonb,
  p_installments jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old public.expenses;
  v_amount integer := (p_expense ->> 'amount_cents')::integer;
  v_today date := public.company_today(p_company_id);
  v_total integer := 0;
  v_paid integer := 0;
  v_count integer;
  v_sum bigint;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para lançar gastos' using errcode = '42501';
  end if;

  if p_expense_id is null then
    perform set_config('app.expense_installments_manual', 'on', true);
    insert into public.expenses (
      company_id, kind, description, category_id, amount_cents, expense_date, employee_id, notes, quote_id, supplier_id, payment_method
    ) values (
      p_company_id, 'one_off',
      p_expense ->> 'description',
      (p_expense ->> 'category_id')::uuid,
      v_amount,
      (p_expense ->> 'expense_date')::date,
      nullif(p_expense ->> 'employee_id', '')::uuid,
      nullif(p_expense ->> 'notes', ''),
      nullif(p_expense ->> 'quote_id', '')::uuid,
      nullif(p_expense ->> 'supplier_id', '')::uuid,
      nullif(p_expense ->> 'payment_method', '')
    )
    returning id into v_id;
    perform set_config('app.expense_installments_manual', 'off', true);
    if p_installments is null then
      raise exception 'Informe como o gasto vai ser pago.' using errcode = 'P0001';
    end if;
  else
    select * into v_old from public.expenses
    where id = p_expense_id and company_id = p_company_id and deleted_at is null
    for update;
    if not found then
      raise exception 'Gasto não encontrado.' using errcode = 'P0001';
    end if;
    if v_old.kind = 'contractor' then
      raise exception 'Este gasto veio do fechamento das horas. Para corrigir, exclua e feche de novo.' using errcode = 'P0001';
    end if;

    select count(*), count(*) filter (where paid_on is not null)
    into v_total, v_paid
    from public.expense_installments
    where expense_id = p_expense_id and deleted_at is null;

    if v_total > 1 and v_paid > 0 and (p_installments is not null or v_amount <> v_old.amount_cents) then
      raise exception 'Este gasto tem parcelas pagas. Para mudar o valor ou as parcelas, desfaça os pagamentos antes.' using errcode = 'P0001';
    end if;
    if p_installments is null and v_total > 1 and v_amount <> v_old.amount_cents then
      raise exception 'Informe as parcelas com o valor novo.' using errcode = 'P0001';
    end if;

    update public.expenses
    set description = p_expense ->> 'description',
        category_id = (p_expense ->> 'category_id')::uuid,
        amount_cents = v_amount,
        expense_date = (p_expense ->> 'expense_date')::date,
        employee_id = nullif(p_expense ->> 'employee_id', '')::uuid,
        notes = nullif(p_expense ->> 'notes', ''),
        quote_id = nullif(p_expense ->> 'quote_id', '')::uuid,
        supplier_id = nullif(p_expense ->> 'supplier_id', '')::uuid,
        payment_method = nullif(p_expense ->> 'payment_method', '')
    where id = p_expense_id;
    v_id := p_expense_id;

    -- Mantendo a parcela única, ela acompanha o valor novo.
    if p_installments is null and v_total = 1 then
      update public.expense_installments set amount_cents = v_amount
      where expense_id = v_id and deleted_at is null;
    end if;
  end if;

  if p_installments is not null then
    v_count := jsonb_array_length(p_installments);
    if v_count < 1 or v_count > 60 then
      raise exception 'Use de 1 a 60 parcelas.' using errcode = 'P0001';
    end if;
    select sum((item ->> 'amount_cents')::integer) into v_sum from jsonb_array_elements(p_installments) item;
    if v_sum <> v_amount then
      raise exception 'As parcelas precisam somar o valor do gasto.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_installments) item
      where (item ->> 'amount_cents')::integer <= 0
         or (item ->> 'due_date') is null
         or nullif(item ->> 'paid_on', '')::date > v_today
    ) then
      raise exception 'Confira as parcelas: valor maior que zero, vencimento informado e pagamento até hoje.' using errcode = 'P0001';
    end if;

    update public.expense_installments set deleted_at = now()
    where expense_id = v_id and deleted_at is null;

    insert into public.expense_installments (company_id, expense_id, number, due_date, amount_cents, paid_on)
    select p_company_id, v_id, ordinality::smallint,
           (item ->> 'due_date')::date,
           (item ->> 'amount_cents')::integer,
           nullif(item ->> 'paid_on', '')::date
    from jsonb_array_elements(p_installments) with ordinality as t(item, ordinality);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_expense(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_expense(uuid, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Dar baixa e desfazer.
-- ---------------------------------------------------------------------------
create or replace function public.pay_expense_installment(p_company_id uuid, p_installment_id uuid, p_paid_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para pagar contas' using errcode = '42501';
  end if;
  if p_paid_on is null or p_paid_on > public.company_today(p_company_id) then
    raise exception 'A data do pagamento não pode ser depois de hoje.' using errcode = 'P0001';
  end if;
  update public.expense_installments i
  set paid_on = p_paid_on
  where i.id = p_installment_id and i.company_id = p_company_id and i.deleted_at is null and i.paid_on is null
    and exists (select 1 from public.expenses e where e.id = i.expense_id and e.deleted_at is null);
  if not found then
    raise exception 'Parcela não encontrada ou já paga.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.undo_pay_expense_installment(p_company_id uuid, p_installment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para pagar contas' using errcode = '42501';
  end if;
  update public.expense_installments i
  set paid_on = null
  where i.id = p_installment_id and i.company_id = p_company_id and i.deleted_at is null and i.paid_on is not null
    and exists (select 1 from public.expenses e where e.id = i.expense_id and e.deleted_at is null);
  if not found then
    raise exception 'Parcela não encontrada ou ainda não paga.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.pay_expense_installment(uuid, uuid, date), public.undo_pay_expense_installment(uuid, uuid) from public, anon;
grant execute on function public.pay_expense_installment(uuid, uuid, date), public.undo_pay_expense_installment(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Excluir gasto também tira as parcelas (como antes, reabre as horas de um pagamento de prestador).
-- ---------------------------------------------------------------------------
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
  update public.expense_installments set deleted_at = now()
  where expense_id = p_expense_id and company_id = p_company_id and deleted_at is null;
  update public.time_entries
  set status = 'approved', expense_id = null
  where expense_id = p_expense_id and company_id = p_company_id;
end;
$$;
