-- Recebimentos: o faturamento é o que foi vendido, no fechamento; o dinheiro entra em parcelas,
-- cada uma com vencimento, forma e a data em que foi recebida de fato. Só owner e admin.

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  quote_id uuid not null,
  amount_cents integer not null check (amount_cents between 1 and 1000000000),
  due_date date not null,
  method text check (method in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other')),
  received_on date,
  received_cents integer check (received_cents between 0 and 1000000000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A chave composta garante que o orçamento é da mesma empresa da parcela.
  foreign key (company_id, quote_id) references public.quotes (company_id, id) on delete cascade,
  check ((received_on is null) = (received_cents is null))
);

create index receivables_open_idx on public.receivables (company_id, due_date) where deleted_at is null and received_on is null;
create index receivables_received_idx on public.receivables (company_id, received_on) where deleted_at is null and received_on is not null;
create index receivables_quote_idx on public.receivables (quote_id) where deleted_at is null;

alter table public.receivables enable row level security;

-- Leitura só de owner e admin; a escrita é pelas funções abaixo.
create policy "receivables_select_admin" on public.receivables
  for select to authenticated using (public.is_company_admin(company_id) and deleted_at is null);

grant select on public.receivables to authenticated;

create trigger receivables_updated_at
  before update on public.receivables
  for each row execute function public.set_updated_at();

-- O que já foi faturado entra como recebido na data de competência: nada muda de valor.
insert into public.receivables (company_id, quote_id, amount_cents, due_date, received_on, received_cents)
select company_id, quote_id, amount_cents, competence_date, competence_date, amount_cents
from public.revenues
where deleted_at is null;

drop function public.close_quote(uuid, uuid, integer, date);

-- p_installments: [{ amount_cents, due_date, method, received }]. Soma igual ao valor fechado.
-- Sem parcelas, vale uma só, recebida na data de competência.
create function public.close_quote(p_company_id uuid, p_quote_id uuid, p_amount_cents integer, p_competence_date date, p_installments jsonb)
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

  -- Parcela marcada como recebida entra no caixa no vencimento, sem passar de hoje.
  insert into public.receivables (company_id, quote_id, amount_cents, due_date, method, received_on, received_cents)
  select
    p_company_id, p_quote_id, (e.value ->> 'amount_cents')::integer, (e.value ->> 'due_date')::date, e.value ->> 'method',
    case when (e.value ->> 'received')::boolean then least((e.value ->> 'due_date')::date, v_today) end,
    case when (e.value ->> 'received')::boolean then (e.value ->> 'amount_cents')::integer end
  from jsonb_array_elements(v_entries) as e(value);
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
  update public.receivables set deleted_at = now() where quote_id = p_quote_id and deleted_at is null;
  update public.quotes set status = 'approved', closed_at = null where id = p_quote_id;
end;
$$;

-- Dá baixa numa parcela. Recebido menos que o valor: a parcela fica com o que entrou e o restante
-- vira uma parcela nova a receber, com o vencimento informado.
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
  if p_received_cents is null or p_received_cents <= 0 or p_received_cents > v_row.amount_cents then
    raise exception 'Informe um valor recebido de até %.', to_char(v_row.amount_cents / 100.0, 'FM999G999G990D00') using errcode = 'P0001';
  end if;
  if p_method is not null and p_method not in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;

  if p_received_cents < v_row.amount_cents then
    insert into public.receivables (company_id, quote_id, amount_cents, due_date, method)
    values (p_company_id, v_row.quote_id, v_row.amount_cents - p_received_cents, coalesce(p_rest_due_date, v_row.due_date), v_row.method);
  end if;
  update public.receivables
  set amount_cents = p_received_cents, received_on = p_received_on, received_cents = p_received_cents,
      method = coalesce(p_method, method)
  where id = p_id;
end;
$$;

-- Volta a parcela para a receber (baixa feita por engano).
create or replace function public.undo_receive_installment(p_company_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só o proprietário e o administrador dão baixa em recebimentos' using errcode = '42501';
  end if;
  update public.receivables set received_on = null, received_cents = null
  where id = p_id and company_id = p_company_id and deleted_at is null and received_on is not null;
  if not found then
    raise exception 'Parcela não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

-- Muda o vencimento e a forma de uma parcela a receber. O valor não muda: a soma é o faturado.
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
  update public.receivables set due_date = p_due_date, method = p_method
  where id = p_id and company_id = p_company_id and deleted_at is null and received_on is null;
  if not found then
    raise exception 'Só parcelas a receber podem ser alteradas.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function
  public.close_quote(uuid, uuid, integer, date, jsonb),
  public.receive_installment(uuid, uuid, date, integer, text, date),
  public.undo_receive_installment(uuid, uuid),
  public.reschedule_installment(uuid, uuid, date, text)
from public, anon;
grant execute on function
  public.close_quote(uuid, uuid, integer, date, jsonb),
  public.receive_installment(uuid, uuid, date, integer, text, date),
  public.undo_receive_installment(uuid, uuid),
  public.reschedule_installment(uuid, uuid, date, text)
to authenticated;
