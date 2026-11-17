-- Antecipação de recebível feita pelo banco do cliente (fora do app): ao dar baixa, o dono pode
-- informar quanto o banco cobrou, em % da parcela ou em reais. O valor vira custo do serviço
-- ("Antecipação") e sai da margem, sem mudar o faturado. É um campo opcional: sem ele, a baixa é a de sempre.

alter table public.receivables
  add column anticipation_cents integer not null default 0 check (anticipation_cents >= 0),
  add constraint receivables_fee_total_check check (fee_cents + anticipation_cents <= amount_cents);

drop function public.receive_installment(uuid, uuid, date, integer, text, date);

-- Baixa. O esperado é o valor menos a taxa do cartão e menos a antecipação; recebido menos que isso
-- deixa o restante a receber. A antecipação vem em reais (p_anticipation_cents) ou em % da parcela
-- (p_anticipation_bps, em centésimos de %): nunca os dois.
create or replace function public.receive_installment(
  p_company_id uuid,
  p_id uuid,
  p_received_on date,
  p_received_cents integer,
  p_method text,
  p_rest_due_date date,
  p_anticipation_cents integer default null,
  p_anticipation_bps integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.receivables;
  v_fee integer;
  v_antic integer := 0;
  v_expected integer;
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
  if p_method is not null and p_method not in ('pix', 'cash', 'debit', 'credit', 'boleto', 'transfer', 'other') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  -- Mudou a forma na baixa: a taxa acompanha.
  v_fee := case when p_method is null or p_method is not distinct from v_row.method then v_row.fee_cents
    else public.card_fee_cents(p_company_id, p_method, v_row.amount_cents) end;

  if p_anticipation_cents is not null and p_anticipation_bps is not null then
    raise exception 'Informe a taxa de antecipação em %% ou em reais, não nos dois.' using errcode = 'P0001';
  end if;
  if p_anticipation_bps is not null then
    if p_anticipation_bps < 1 or p_anticipation_bps > 5000 then
      raise exception 'Informe uma taxa de antecipação entre 0,01%% e 50%%.' using errcode = 'P0001';
    end if;
    v_antic := round(v_row.amount_cents * p_anticipation_bps / 10000.0)::integer;
  elsif p_anticipation_cents is not null then
    if p_anticipation_cents < 1 then
      raise exception 'Informe o valor da antecipação.' using errcode = 'P0001';
    end if;
    v_antic := p_anticipation_cents;
  end if;
  if v_antic >= v_row.amount_cents - v_fee then
    raise exception 'A antecipação precisa ser menor que o valor a receber.' using errcode = 'P0001';
  end if;

  v_expected := v_row.amount_cents - v_fee - v_antic;
  if p_received_cents is null or p_received_cents <= 0 or p_received_cents > v_row.amount_cents - v_antic then
    raise exception 'Informe um valor recebido de até %.', to_char((v_row.amount_cents - v_antic) / 100.0, 'FM999G999G990D00') using errcode = 'P0001';
  end if;

  if p_received_cents < v_expected then
    -- O que faltou entrar vira parcela nova; a taxa e a antecipação ficam com a parte já recebida.
    insert into public.receivables (company_id, quote_id, amount_cents, due_date, method)
    values (p_company_id, v_row.quote_id, v_expected - p_received_cents, coalesce(p_rest_due_date, v_row.due_date), coalesce(p_method, v_row.method));
    update public.receivables
    set amount_cents = p_received_cents + v_fee + v_antic, fee_cents = v_fee, anticipation_cents = v_antic,
        received_on = p_received_on, received_cents = p_received_cents, method = coalesce(p_method, method)
    where id = p_id;
  else
    -- Recebeu o esperado ou mais (taxa menor que a cadastrada): a diferença sai da taxa do cartão.
    update public.receivables
    set fee_cents = v_row.amount_cents - p_received_cents - v_antic, anticipation_cents = v_antic,
        received_on = p_received_on, received_cents = p_received_cents, method = coalesce(p_method, method)
    where id = p_id;
  end if;
end;
$$;

revoke execute on function public.receive_installment(uuid, uuid, date, integer, text, date, integer, integer) from public, anon;
grant execute on function public.receive_installment(uuid, uuid, date, integer, text, date, integer, integer) to authenticated;

-- Desfazer a baixa também desfaz a antecipação: sem recebimento, não há custo de banco.
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
  update public.receivables set received_on = null, received_cents = null, anticipation_cents = 0
  where id = p_id and company_id = p_company_id and deleted_at is null and received_on is not null;
  if not found then
    raise exception 'Parcela não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;
