-- Contas a pagar (parcelas dos gastos): isolamento entre empresas, quem pode lançar e pagar, e as travas
-- das parcelas. Roda em transação com ROLLBACK. Qualquer falha aborta com RAISE EXCEPTION.
--
-- Uso: npm run test:rls (com o Supabase local de pé).

\set ON_ERROR_STOP on

begin;

-- "Hoje" do teste = hoje da empresa (Brasília), como o banco confere o pagamento. Sem isso, entre 21h e
-- meia-noite o current_date em UTC já é amanhã e o pagamento "de hoje" vira data futura.
set local timezone = 'America/Sao_Paulo';

insert into auth.users (id, email, aud, role, instance_id, email_confirmed_at, raw_user_meta_data) values
  ('ca700000-0000-4000-8000-000000000001', 'pay-owner-a@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), '{}'),
  ('ca700000-0000-4000-8000-000000000002', 'pay-member-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), '{}'),
  ('ca700000-0000-4000-8000-000000000003', 'pay-owner-b@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), '{}');

insert into public.companies (id, name, slug, created_by) values
  ('ca70c000-0000-4000-8000-00000000000a', 'Pagar A', 'pay-a', 'ca700000-0000-4000-8000-000000000001'),
  ('ca70c000-0000-4000-8000-00000000000b', 'Pagar B', 'pay-b', 'ca700000-0000-4000-8000-000000000003');

insert into public.company_members (company_id, user_id, role) values
  ('ca70c000-0000-4000-8000-00000000000a', 'ca700000-0000-4000-8000-000000000001', 'owner'),
  ('ca70c000-0000-4000-8000-00000000000a', 'ca700000-0000-4000-8000-000000000002', 'member'),
  ('ca70c000-0000-4000-8000-00000000000b', 'ca700000-0000-4000-8000-000000000003', 'owner');

create schema pay_test;
grant usage on schema pay_test to authenticated;
create table pay_test.ids (key text primary key, id uuid);
grant select, insert on pay_test.ids to authenticated;

create function pay_test.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pay_test to authenticated;

-- Gasto lançado por fora de save_expense (como as recorrências e a folha) ganha a parcela automática.
do $$
declare
  v_category uuid;
  v_paid date;
  n integer;
begin
  select id into v_category from public.expense_categories where company_id = 'ca70c000-0000-4000-8000-00000000000a' limit 1;
  insert into pay_test.ids values ('category', v_category);

  insert into public.expenses (company_id, description, category_id, amount_cents, expense_date, kind)
  values ('ca70c000-0000-4000-8000-00000000000a', 'Folha futura', v_category, 5000, current_date + 10, 'payroll');
  select i.paid_on into v_paid from public.expense_installments i join public.expenses e on e.id = i.expense_id where e.description = 'Folha futura';
  if v_paid is distinct from current_date + 10 then raise exception 'FALHA pagar: folha gerada deveria contar como paga na data dela'; end if;

  insert into public.expenses (company_id, description, category_id, amount_cents, expense_date, kind)
  values ('ca70c000-0000-4000-8000-00000000000a', 'Pontual futuro', v_category, 7000, current_date + 10, 'one_off');
  select count(*) into n from public.expense_installments i join public.expenses e on e.id = i.expense_id
  where e.description = 'Pontual futuro' and i.paid_on is null and i.due_date = current_date + 10 and i.amount_cents = 7000;
  if n <> 1 then raise exception 'FALHA pagar: pontual com data futura deveria ficar a pagar'; end if;
end $$;

set local role authenticated;

-- Owner da empresa A: compra de 3.000 em 3 parcelas.
select pay_test.login('ca700000-0000-4000-8000-000000000001');
do $$
declare
  v_category uuid := (select id from pay_test.ids where key = 'category');
  v_expense uuid;
  v_first uuid;
  n integer;
begin
  v_expense := public.save_expense(
    'ca70c000-0000-4000-8000-00000000000a', null,
    jsonb_build_object('description', 'Ferramentas', 'category_id', v_category, 'amount_cents', 300000, 'expense_date', current_date, 'payment_method', 'credit'),
    jsonb_build_array(
      jsonb_build_object('due_date', current_date + 17, 'amount_cents', 100000, 'paid_on', null),
      jsonb_build_object('due_date', current_date + 47, 'amount_cents', 100000, 'paid_on', null),
      jsonb_build_object('due_date', current_date + 77, 'amount_cents', 100000, 'paid_on', null)
    )
  );
  insert into pay_test.ids values ('expense', v_expense);
  select count(*) into n from public.expense_installments where expense_id = v_expense and deleted_at is null and paid_on is null;
  if n <> 3 then raise exception 'FALHA pagar: deveria ter 3 parcelas a pagar (tem %)', n; end if;

  -- Parcelas que não somam o valor, pagamento no futuro ou mais de 60 parcelas: recusado.
  begin
    perform public.save_expense('ca70c000-0000-4000-8000-00000000000a', null,
      jsonb_build_object('description', 'Errado', 'category_id', v_category, 'amount_cents', 1000, 'expense_date', current_date),
      jsonb_build_array(jsonb_build_object('due_date', current_date, 'amount_cents', 900)));
    raise exception 'FALHA pagar: aceitou parcelas que não somam o valor' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.save_expense('ca70c000-0000-4000-8000-00000000000a', null,
      jsonb_build_object('description', 'Errado', 'category_id', v_category, 'amount_cents', 1000, 'expense_date', current_date),
      jsonb_build_array(jsonb_build_object('due_date', current_date + 5, 'amount_cents', 1000, 'paid_on', current_date + 5)));
    raise exception 'FALHA pagar: aceitou pagamento no futuro' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;

  -- Dar baixa na 1ª; pagar no futuro é recusado.
  select id into v_first from public.expense_installments where expense_id = v_expense and number = 1 and deleted_at is null;
  insert into pay_test.ids values ('first', v_first);
  begin
    perform public.pay_expense_installment('ca70c000-0000-4000-8000-00000000000a', v_first, current_date + 1);
    raise exception 'FALHA pagar: baixa com data futura' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.pay_expense_installment('ca70c000-0000-4000-8000-00000000000a', v_first, current_date);

  -- Com parcela paga, valor e parcelas travam; o resto do gasto ainda muda.
  begin
    perform public.save_expense('ca70c000-0000-4000-8000-00000000000a', v_expense,
      jsonb_build_object('description', 'Ferramentas', 'category_id', v_category, 'amount_cents', 300000, 'expense_date', current_date),
      jsonb_build_array(jsonb_build_object('due_date', current_date, 'amount_cents', 300000)));
    raise exception 'FALHA pagar: trocou parcelas com uma já paga' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.save_expense('ca70c000-0000-4000-8000-00000000000a', v_expense,
      jsonb_build_object('description', 'Ferramentas', 'category_id', v_category, 'amount_cents', 250000, 'expense_date', current_date), null);
    raise exception 'FALHA pagar: mudou o valor com parcela paga' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.save_expense('ca70c000-0000-4000-8000-00000000000a', v_expense,
    jsonb_build_object('description', 'Ferramentas da obra', 'category_id', v_category, 'amount_cents', 300000, 'expense_date', current_date), null);
  select count(*) into n from public.expense_installments where expense_id = v_expense and deleted_at is null;
  if n <> 3 then raise exception 'FALHA pagar: editar a descrição não pode mexer nas parcelas'; end if;
end $$;

-- Escrita direta em expenses saiu: tudo passa pelas funções.
do $$
begin
  insert into public.expenses (company_id, description, category_id, amount_cents, expense_date)
  values ('ca70c000-0000-4000-8000-00000000000a', 'Direto', (select id from pay_test.ids where key = 'category'), 100, current_date);
  raise exception 'FALHA pagar: insert direto em expenses passou' using errcode = 'MN999';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  update public.expense_installments set paid_on = null;
  raise exception 'FALHA pagar: update direto nas parcelas passou' using errcode = 'MN999';
exception when insufficient_privilege then null;
end $$;

-- Membro da empresa A: não vê nem paga contas.
select pay_test.login('ca700000-0000-4000-8000-000000000002');
do $$
declare
  n integer;
begin
  select count(*) into n from public.expense_installments;
  if n <> 0 then raise exception 'FALHA pagar: membro viu % parcelas', n; end if;
  begin
    perform public.undo_pay_expense_installment('ca70c000-0000-4000-8000-00000000000a', (select id from pay_test.ids where key = 'first'));
    raise exception 'FALHA pagar: membro desfez pagamento' using errcode = 'MN999';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Owner da empresa B: não vê, não paga e não mexe nas parcelas da A.
select pay_test.login('ca700000-0000-4000-8000-000000000003');
do $$
declare
  n integer;
  v_other_category uuid;
begin
  select count(*) into n from public.expense_installments where company_id = 'ca70c000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FALHA pagar: outra empresa viu % parcelas', n; end if;
  begin
    perform public.undo_pay_expense_installment('ca70c000-0000-4000-8000-00000000000a', (select id from pay_test.ids where key = 'first'));
    raise exception 'FALHA pagar: outra empresa desfez pagamento' using errcode = 'MN999';
  exception when insufficient_privilege then null;
  end;
  -- Pela própria empresa, com o id da parcela da outra: não acha.
  begin
    perform public.undo_pay_expense_installment('ca70c000-0000-4000-8000-00000000000b', (select id from pay_test.ids where key = 'first'));
    raise exception 'FALHA pagar: desfez parcela de outra empresa' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;
  -- Editar o gasto da A informando a própria empresa: não acha.
  select id into v_other_category from public.expense_categories where company_id = 'ca70c000-0000-4000-8000-00000000000b' limit 1;
  begin
    perform public.save_expense('ca70c000-0000-4000-8000-00000000000b', (select id from pay_test.ids where key = 'expense'),
      jsonb_build_object('description', 'Invadido', 'category_id', v_other_category, 'amount_cents', 300000, 'expense_date', current_date), null);
    raise exception 'FALHA pagar: editou gasto de outra empresa' using errcode = 'MN999';
  exception when sqlstate 'P0001' then null;
  end;
end $$;

-- Owner A desfaz o pagamento, troca as parcelas e exclui: as parcelas saem junto.
select pay_test.login('ca700000-0000-4000-8000-000000000001');
do $$
declare
  v_expense uuid := (select id from pay_test.ids where key = 'expense');
  v_category uuid := (select id from pay_test.ids where key = 'category');
  n integer;
begin
  perform public.undo_pay_expense_installment('ca70c000-0000-4000-8000-00000000000a', (select id from pay_test.ids where key = 'first'));
  perform public.save_expense('ca70c000-0000-4000-8000-00000000000a', v_expense,
    jsonb_build_object('description', 'Ferramentas da obra', 'category_id', v_category, 'amount_cents', 300000, 'expense_date', current_date),
    jsonb_build_array(jsonb_build_object('due_date', current_date + 17, 'amount_cents', 150000), jsonb_build_object('due_date', current_date + 47, 'amount_cents', 150000)));
  select count(*) into n from public.expense_installments where expense_id = v_expense and deleted_at is null;
  if n <> 2 then raise exception 'FALHA pagar: sem nada pago, deveria trocar para 2 parcelas (tem %)', n; end if;

  perform public.delete_expense('ca70c000-0000-4000-8000-00000000000a', v_expense);
  select count(*) into n from public.expense_installments where expense_id = v_expense and deleted_at is null;
  if n <> 0 then raise exception 'FALHA pagar: excluir o gasto deveria tirar as parcelas'; end if;
end $$;

reset role;
rollback;
select 'PAGAR OK: contas a pagar isoladas por empresa e com as travas das parcelas.';
