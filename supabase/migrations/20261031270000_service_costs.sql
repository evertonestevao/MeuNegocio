-- Custos e resultado por serviço: gastos pontuais podem apontar para um orçamento aprovado ou
-- fechado, e a empresa define a meta de margem. A mão de obra vem das horas, não daqui.

alter table public.expenses
  add column quote_id uuid,
  add column supplier text check (supplier is null or length(supplier) between 1 and 120),
  -- A chave composta garante que o orçamento é da mesma empresa do gasto.
  add constraint expenses_quote_fkey foreign key (company_id, quote_id) references public.quotes (company_id, id);

create index expenses_quote_idx on public.expenses (quote_id) where quote_id is not null and deleted_at is null;

create or replace function public.check_expense_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quote_id is null or (tg_op = 'UPDATE' and new.quote_id is not distinct from old.quote_id) then
    return new;
  end if;
  if new.kind <> 'one_off' then
    raise exception 'Só gastos pontuais podem ser ligados a um orçamento.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.quotes
    where id = new.quote_id and company_id = new.company_id and deleted_at is null and status in ('approved', 'closed')
  ) then
    raise exception 'Escolha um orçamento aprovado ou fechado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_expense_quote
  before insert or update of quote_id, kind on public.expenses
  for each row execute function public.check_expense_quote();

revoke execute on function public.check_expense_quote() from public, anon, authenticated;

alter table public.company_profiles
  add column target_margin_percent integer not null default 20 check (target_margin_percent between 0 and 100);
