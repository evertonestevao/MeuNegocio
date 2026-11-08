-- Regressão de segurança: cada bloco repete um ataque real feito direto na API do Supabase, com o
-- token do próprio usuário, sem passar pelo app. Ao fim, invariantes valem para qualquer tabela ou
-- função nova. Roda em transação com ROLLBACK. Qualquer falha aborta com RAISE EXCEPTION.
--
-- Uso: npm run test:rls (com o Supabase local de pé).

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('5ec00000-0000-4000-8000-000000000002', 'sec-admin@test.local',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('5ec00000-0000-4000-8000-000000000003', 'sec-member@test.local',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('5ec00000-0000-4000-8000-000000000005', 'sec-free@test.local',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('5ec00000-0000-4000-8000-000000000006', 'sec-guest@test.local',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}');

-- PRO: assinatura paga, com owner, admin e member. FREE: sem assinatura.
insert into public.companies (id, name, slug, created_by) values
  ('5ec0c000-0000-4000-8000-000000000001', 'Pro',  'sec-pro',  '5ec00000-0000-4000-8000-000000000001'),
  ('5ec0c000-0000-4000-8000-000000000002', 'Free', 'sec-free', '5ec00000-0000-4000-8000-000000000005');

insert into public.subscriptions (company_id, plan_id, status)
select '5ec0c000-0000-4000-8000-000000000001', id, 'active' from public.plans where code = 'pro';

insert into public.company_members (company_id, user_id, role) values
  ('5ec0c000-0000-4000-8000-000000000001', '5ec00000-0000-4000-8000-000000000001', 'owner'),
  ('5ec0c000-0000-4000-8000-000000000001', '5ec00000-0000-4000-8000-000000000002', 'admin'),
  ('5ec0c000-0000-4000-8000-000000000001', '5ec00000-0000-4000-8000-000000000003', 'member'),
  ('5ec0c000-0000-4000-8000-000000000002', '5ec00000-0000-4000-8000-000000000005', 'owner');

-- Helpers que somem no ROLLBACK.
create schema sec_test;
grant usage on schema sec_test to authenticated;

create function sec_test.login(p_user uuid, p_email text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text, true);
$$;

-- O ataque precisa ser barrado por permissão, trava de plano ou constraint, ou não afetar linha
-- nenhuma (filtro da RLS). Outro erro, como coluna inexistente, não conta e derruba o teste.
create function sec_test.must_fail(p_label text, p_sql text) returns void
language plpgsql as $$
declare
  v_rows bigint;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege or check_violation or sqlstate 'MN001' then
    return;
  end;
  if v_rows > 0 then
    raise exception 'FALHA %: o ataque passou (% linhas)', p_label, v_rows;
  end if;
end;
$$;

create function sec_test.must_pass(p_label text, p_sql text) returns void
language plpgsql as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'FALHA %: operação legítima não afetou nenhuma linha', p_label;
  end if;
end;
$$;

grant execute on all functions in schema sec_test to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Owner: não dá plano a si mesmo.
-- ---------------------------------------------------------------------------
select sec_test.login('5ec00000-0000-4000-8000-000000000005', 'sec-free@test.local');
select sec_test.must_fail('owner cria assinatura paga',
  $$insert into public.subscriptions (company_id, plan_id, status)
    select '5ec0c000-0000-4000-8000-000000000002', id, 'active' from public.plans where code = 'enterprise'$$);

select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
select sec_test.must_fail('owner troca o próprio plano',
  $$update public.subscriptions set plan_id = (select id from public.plans where code = 'enterprise')
    where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('owner altera o preço contratado',
  $$update public.subscriptions set contracted_extra_seat_price_cents = 0
    where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('owner reativa a assinatura',
  $$update public.subscriptions set status = 'active'
    where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);

-- ---------------------------------------------------------------------------
-- Admin: não sobe de papel, não mexe no owner, não coloca gente sem convite, não encerra empresa.
-- ---------------------------------------------------------------------------
select sec_test.login('5ec00000-0000-4000-8000-000000000002', 'sec-admin@test.local');
select sec_test.must_fail('admin se promove a owner',
  $$update public.company_members set role = 'owner' where user_id = '5ec00000-0000-4000-8000-000000000002'$$);
select sec_test.must_fail('admin promove outro a owner',
  $$update public.company_members set role = 'owner' where user_id = '5ec00000-0000-4000-8000-000000000003'$$);
select sec_test.must_fail('admin rebaixa o owner',
  $$update public.company_members set role = 'member' where user_id = '5ec00000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('admin remove o owner',
  $$update public.company_members set deleted_at = now() where user_id = '5ec00000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('admin altera o próprio papel',
  $$update public.company_members set role = 'member' where user_id = '5ec00000-0000-4000-8000-000000000002'$$);
select sec_test.must_fail('admin insere membro sem convite',
  $$insert into public.company_members (company_id, user_id, role)
    values ('5ec0c000-0000-4000-8000-000000000001', '5ec00000-0000-4000-8000-000000000004', 'admin')$$);
select sec_test.must_fail('admin troca a pessoa de uma membership',
  $$update public.company_members set user_id = '5ec00000-0000-4000-8000-000000000004'
    where user_id = '5ec00000-0000-4000-8000-000000000003'$$);
select sec_test.must_fail('admin encerra a empresa',
  $$update public.companies set deleted_at = now() where id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('admin troca o criador da empresa',
  $$update public.companies set created_by = '5ec00000-0000-4000-8000-000000000002'
    where id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('admin convida para owner',
  $$insert into public.company_invites (company_id, email, role, invited_by)
    values ('5ec0c000-0000-4000-8000-000000000001', 'sec-stranger@test.local', 'owner', '5ec00000-0000-4000-8000-000000000002')$$);
select sec_test.must_fail('admin grava override de feature',
  $$insert into public.settings (company_id, key, value)
    values ('5ec0c000-0000-4000-8000-000000000001', 'feature:work_orders', 'true')$$);
select sec_test.must_fail('membro forja auditoria',
  $$insert into public.audit_logs (company_id, user_id, action)
    values ('5ec0c000-0000-4000-8000-000000000001', null, 'member.removed')$$);

-- O que o app faz continua funcionando.
select sec_test.must_pass('admin renomeia a empresa',
  $$update public.companies set name = 'Pro 2' where id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_pass('admin muda papel de quem está abaixo',
  $$update public.company_members set role = 'technician' where user_id = '5ec00000-0000-4000-8000-000000000003'$$);
select sec_test.must_pass('admin grava setting comum',
  $$insert into public.settings (company_id, key, value)
    values ('5ec0c000-0000-4000-8000-000000000001', 'sec-test', '1')$$);
select sec_test.must_fail('admin renomeia setting para override de feature',
  $$update public.settings set key = 'feature:hours' where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);

-- ---------------------------------------------------------------------------
-- Convite: o banco ignora prazo e token enviados, e só permite revogar.
-- ---------------------------------------------------------------------------
do $$
declare
  v_invite public.company_invites;
begin
  insert into public.company_invites (company_id, email, role, invited_by, expires_at, token)
  values ('5ec0c000-0000-4000-8000-000000000001', 'sec-guest@test.local', 'member',
    '5ec00000-0000-4000-8000-000000000002', now() + interval '10 years', '5ec0d000-0000-4000-8000-000000000001')
  returning * into v_invite;

  if v_invite.expires_at > now() + interval '8 days' then
    raise exception 'FALHA convite: prazo escolhido pelo admin foi aceito';
  end if;
  if v_invite.token = '5ec0d000-0000-4000-8000-000000000001' then
    raise exception 'FALHA convite: token escolhido pelo admin foi aceito';
  end if;

  perform sec_test.must_fail('admin promove convite a owner',
    format($q$update public.company_invites set role = 'owner' where id = %L$q$, v_invite.id));
  perform sec_test.must_fail('admin redireciona convite para outro email',
    format($q$update public.company_invites set email = 'x@test.local' where id = %L$q$, v_invite.id));
  perform sec_test.must_fail('admin estende o prazo do convite',
    format($q$update public.company_invites set expires_at = now() + interval '1 year' where id = %L$q$, v_invite.id));
  perform sec_test.must_fail('admin marca convite como aceito',
    format($q$update public.company_invites set status = 'accepted' where id = %L$q$, v_invite.id));

  perform sec_test.must_pass('admin revoga convite',
    format($q$update public.company_invites set status = 'revoked' where id = %L$q$, v_invite.id));
  perform sec_test.must_fail('admin reabre convite revogado',
    format($q$update public.company_invites set status = 'pending' where id = %L$q$, v_invite.id));
end $$;

-- ---------------------------------------------------------------------------
-- Member não ganha nada de admin.
-- ---------------------------------------------------------------------------
select sec_test.login('5ec00000-0000-4000-8000-000000000003', 'sec-member@test.local');
select sec_test.must_fail('member muda o próprio papel',
  $$update public.company_members set role = 'admin' where user_id = '5ec00000-0000-4000-8000-000000000003'$$);
select sec_test.must_fail('member cria convite',
  $$insert into public.company_invites (company_id, email, role, invited_by)
    values ('5ec0c000-0000-4000-8000-000000000001', 'y@test.local', 'admin', '5ec00000-0000-4000-8000-000000000003')$$);

-- ---------------------------------------------------------------------------
-- Evidência LGPD: IP e navegador não são escolhidos por quem aceita.
-- ---------------------------------------------------------------------------
select sec_test.must_fail('usuário forja o aceite dos termos',
  $$insert into public.terms_acceptances (user_id, terms_version_id, ip_address, user_agent)
    values ('5ec00000-0000-4000-8000-000000000003', gen_random_uuid(), '1.2.3.4', 'forjado')$$);
select sec_test.must_fail('usuário forja o consentimento',
  $$insert into public.user_consents (user_id, consent_type, granted, ip_address)
    values ('5ec00000-0000-4000-8000-000000000003', 'email_communications', true, '1.2.3.4')$$);

-- ---------------------------------------------------------------------------
-- Limites do Free direto no banco, sem passar pelo service.
-- ---------------------------------------------------------------------------
select sec_test.login('5ec00000-0000-4000-8000-000000000005', 'sec-free@test.local');

do $$
declare
  v_code text;
  v_token uuid;
begin
  -- Membros: Free tem 2 vagas e não vende extra. Owner + 1 convite enche; o segundo para.
  insert into public.company_invites (company_id, email, role, invited_by)
  values ('5ec0c000-0000-4000-8000-000000000002', 'sec-guest@test.local', 'member', '5ec00000-0000-4000-8000-000000000005')
  returning token into v_token;

  begin
    insert into public.company_invites (company_id, email, role, invited_by)
    values ('5ec0c000-0000-4000-8000-000000000002', 'terceiro@test.local', 'member', '5ec00000-0000-4000-8000-000000000005');
    raise exception 'FALHA vagas: convite acima do limite do Free passou';
  exception when sqlstate 'MN001' then null; -- esperado
  end;

  -- Clientes: limite 30.
  insert into public.clients (company_id, name)
  select '5ec0c000-0000-4000-8000-000000000002', 'Cliente ' || g from generate_series(1, 30) g;
  begin
    insert into public.clients (company_id, name) values ('5ec0c000-0000-4000-8000-000000000002', 'Cliente 31');
    raise exception 'FALHA clientes: inserção acima do limite do Free passou';
  exception when sqlstate 'MN001' then null; -- esperado
  end;

  -- O convite já emitido ainda cabe: a vaga estava reservada.
  perform set_config('sec_test.token', v_token::text, true);
end $$;

select sec_test.login('5ec00000-0000-4000-8000-000000000006', 'sec-guest@test.local');
select public.accept_company_invite(current_setting('sec_test.token')::uuid);

reset role;

-- Com superuser, porque a trava vale para qualquer caminho, inclusive RPC e service_role.
do $$
declare
  v_client uuid;
begin
  select id into v_client from public.clients
  where company_id = '5ec0c000-0000-4000-8000-000000000002' limit 1;

  -- Quotes: limite 20 por mês.
  insert into public.quotes (company_id, number, client_id, title)
  select '5ec0c000-0000-4000-8000-000000000002', g, v_client, 'Orçamento ' || g from generate_series(1, 20) g;
  begin
    insert into public.quotes (company_id, number, client_id, title)
    values ('5ec0c000-0000-4000-8000-000000000002', 21, v_client, 'Orçamento 21');
    raise exception 'FALHA orçamentos: acima do limite do Free passou';
  exception when sqlstate 'MN001' then null; -- esperado
  end;

  -- Membro acima do limite, mesmo por RPC ou service_role.
  begin
    insert into public.company_members (company_id, user_id, role)
    values ('5ec0c000-0000-4000-8000-000000000002', '5ec00000-0000-4000-8000-000000000004', 'member');
    raise exception 'FALHA vagas: membro acima do limite do Free passou';
  exception when sqlstate 'MN001' then null; -- esperado
  end;

  -- Recursos pagos. A trava roda antes das FKs: sem ela, o insert quebra e o teste também.
  begin
    insert into public.work_orders (company_id, visit_id, started_time)
    values ('5ec0c000-0000-4000-8000-000000000002', gen_random_uuid(), '08:00');
    raise exception 'FALHA ordem de serviço: criada no Free';
  exception when sqlstate 'MN001' then null; -- esperado
  end;
  begin
    insert into public.time_entries (company_id, employee_id, entry_date, starts_at, ends_at)
    values ('5ec0c000-0000-4000-8000-000000000002', gen_random_uuid(), current_date, '08:00', '09:00');
    raise exception 'FALHA horas: lançada no Free';
  exception when sqlstate 'MN001' then null; -- esperado
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Preço contratado: editar o plano não muda quem já assina; trocar de plano atualiza.
-- ---------------------------------------------------------------------------
do $$
declare
  v_price integer;
  v_extra integer;
  v_plan_price integer;
begin
  select price_cents into v_plan_price from public.plans where code = 'pro';
  update public.plans set price_cents = price_cents + 5000, extra_seat_price_cents = extra_seat_price_cents + 500
  where code = 'pro';

  update public.subscriptions set status = 'past_due'
  where company_id = '5ec0c000-0000-4000-8000-000000000001';

  select contracted_price_cents into v_price from public.subscriptions
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  if v_price <> v_plan_price then
    raise exception 'FALHA preço contratado: mudou com a edição do plano (% -> %)', v_plan_price, v_price;
  end if;

  update public.subscriptions set contracted_price_cents = 1
  where company_id = '5ec0c000-0000-4000-8000-000000000001';
  select contracted_price_cents into v_price from public.subscriptions
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  if v_price <> v_plan_price then
    raise exception 'FALHA preço contratado: aceitou valor escrito à mão';
  end if;

  update public.subscriptions set plan_id = (select id from public.plans where code = 'enterprise')
  where company_id = '5ec0c000-0000-4000-8000-000000000001';
  select s.contracted_price_cents, s.contracted_extra_seat_price_cents into v_price, v_extra
  from public.subscriptions s where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  if not exists (
    select 1 from public.plans
    where code = 'enterprise' and price_cents = v_price and extra_seat_price_cents = v_extra
  ) then
    raise exception 'FALHA preço contratado: não acompanhou a troca de plano';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelamento: plano segue até o fim do período pago e depois cai para o Free.
-- ---------------------------------------------------------------------------
do $$
declare
  v_max text;
  v_enterprise text;
begin
  select features ->> 'max_members' into v_enterprise from public.plans where code = 'enterprise';

  update public.subscriptions set status = 'canceled', current_period_end = now() + interval '10 days'
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  select features ->> 'max_members' into v_max from public.company_plan_terms('5ec0c000-0000-4000-8000-000000000001');
  if v_max is distinct from v_enterprise then
    raise exception 'FALHA cancelamento: perdeu o plano antes do fim do período pago';
  end if;

  update public.subscriptions set current_period_end = now() - interval '1 day'
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  select features ->> 'max_members' into v_max from public.company_plan_terms('5ec0c000-0000-4000-8000-000000000001');
  if v_max is not distinct from v_enterprise then
    raise exception 'FALHA cancelamento: manteve o plano depois do fim do período pago';
  end if;

  update public.subscriptions set current_period_end = null
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  select features ->> 'max_members' into v_max from public.company_plan_terms('5ec0c000-0000-4000-8000-000000000001');
  if v_max is not distinct from v_enterprise then
    raise exception 'FALHA cancelamento: sem período conhecido não pode manter o plano';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Compra parcelada: não renova. Mesmo ativa, o plano acaba com o período.
-- ---------------------------------------------------------------------------
do $$
declare
  v_max text;
  v_paid text;
begin
  select features ->> 'max_members' into v_paid from public.plans where code = 'enterprise';
  update public.subscriptions set status = 'active', renews = false, current_period_end = now() + interval '10 days'
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  select features ->> 'max_members' into v_max from public.company_plan_terms('5ec0c000-0000-4000-8000-000000000001');
  if v_max is distinct from v_paid then raise exception 'FALHA parcelado: perdeu o plano antes do fim'; end if;

  update public.subscriptions set current_period_end = now() - interval '1 day'
  where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null;
  select features ->> 'max_members' into v_max from public.company_plan_terms('5ec0c000-0000-4000-8000-000000000001');
  if v_max is not distinct from v_paid then raise exception 'FALHA parcelado: manteve o plano depois do fim'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Checklists: modelo só com owner e admin, nunca de outra empresa.
-- ---------------------------------------------------------------------------
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000003', 'sec-member@test.local');
select sec_test.must_fail('membro altera o modelo de checklist',
  $$select public.save_checklist_template('5ec0c000-0000-4000-8000-000000000001', 'execution', array['x'])$$);
select sec_test.must_fail('membro grava direto no modelo de checklist',
  $$insert into public.checklist_templates (company_id, kind, labels) values ('5ec0c000-0000-4000-8000-000000000001', 'execution', array['x'])$$);
select sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
select sec_test.must_fail('outra empresa lê o modelo de checklist',
  $$select public.list_checklist_templates('5ec0c000-0000-4000-8000-000000000001')$$);
select sec_test.must_fail('outra empresa altera o modelo de checklist',
  $$select public.save_checklist_template('5ec0c000-0000-4000-8000-000000000001', 'execution', array['x'])$$);
select sec_test.login('5ec00000-0000-4000-8000-000000000002', 'sec-admin@test.local');
select public.save_checklist_template('5ec0c000-0000-4000-8000-000000000001', 'execution', array['  Item do admin  ', '']);
do $$
begin
  if (public.list_checklist_templates('5ec0c000-0000-4000-8000-000000000001') -> 'execution') <> '["Item do admin"]'::jsonb then
    raise exception 'FALHA checklist: admin não conseguiu salvar o modelo limpo';
  end if;
end $$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.list_checklist_templates(uuid)', 'execute')
    or has_function_privilege('anon', 'public.add_work_order_checklist_item(uuid, uuid, text)', 'execute') then
    raise exception 'FALHA checklist: função aberta para anônimo';
  end if;
end $$;

-- Item em campo: só em ordem aberta de quem está escalado.
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
do $$
begin
  perform public.add_work_order_checklist_item('5ec0c000-0000-4000-8000-000000000001', gen_random_uuid(), 'x');
  raise exception 'FALHA checklist: item incluído em visita que não é do usuário' using errcode = 'P0002';
exception when raise_exception then null; -- recusa esperada, com mensagem ao usuário
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Custos por serviço: o gasto só aponta para orçamento aprovado ou fechado da mesma empresa.
-- ---------------------------------------------------------------------------
do $$
declare
  v_category uuid;
  v_other_quote uuid;
  v_draft uuid;
begin
  insert into public.expense_categories (company_id, name) values ('5ec0c000-0000-4000-8000-000000000001', 'Custos teste')
  returning id into v_category;
  -- Só para montar o cenário: a outra empresa é Free e a trava de limite barraria o orçamento.
  set local session_replication_role = replica;
  insert into public.quotes (company_id, number, status) values ('5ec0c000-0000-4000-8000-000000000002', 990, 'approved')
  returning id into v_other_quote;
  set local session_replication_role = origin;
  insert into public.quotes (company_id, number, status) values ('5ec0c000-0000-4000-8000-000000000001', 991, 'draft')
  returning id into v_draft;
  begin
    insert into public.expenses (company_id, description, category_id, amount_cents, expense_date, quote_id)
    values ('5ec0c000-0000-4000-8000-000000000001', 'Gasto alheio', v_category, 100, current_date, v_other_quote);
    raise exception 'FALHA custos: gasto ligado a orçamento de outra empresa' using errcode = 'P0002';
  exception when foreign_key_violation or raise_exception then null;
  end;
  begin
    insert into public.expenses (company_id, description, category_id, amount_cents, expense_date, quote_id)
    values ('5ec0c000-0000-4000-8000-000000000001', 'Gasto em rascunho', v_category, 100, current_date, v_draft);
    raise exception 'FALHA custos: gasto ligado a orçamento em rascunho' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Fornecedores: gasto não aponta para fornecedor de outra empresa; membro não vê nem cadastra.
-- ---------------------------------------------------------------------------
do $$
declare
  v_category uuid;
  v_other uuid;
begin
  select id into v_category from public.expense_categories where company_id = '5ec0c000-0000-4000-8000-000000000001' limit 1;
  insert into public.suppliers (company_id, name) values ('5ec0c000-0000-4000-8000-000000000002', 'Fornecedor alheio') returning id into v_other;
  begin
    insert into public.expenses (company_id, description, category_id, amount_cents, expense_date, supplier_id)
    values ('5ec0c000-0000-4000-8000-000000000001', 'Gasto com fornecedor alheio', v_category, 100, current_date, v_other);
    raise exception 'FALHA fornecedores: gasto ligado a fornecedor de outra empresa' using errcode = 'P0002';
  exception when foreign_key_violation then null;
  end;
  insert into public.suppliers (company_id, name) values ('5ec0c000-0000-4000-8000-000000000001', 'Casa Teste');
  begin
    insert into public.suppliers (company_id, name) values ('5ec0c000-0000-4000-8000-000000000001', 'casa teste');
    raise exception 'FALHA fornecedores: nome repetido com outra caixa' using errcode = 'P0002';
  exception when unique_violation then null;
  end;
end $$;

set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000003', 'sec-member@test.local');
select sec_test.must_fail('membro lê fornecedores',
  $$update public.suppliers set name = name where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('membro cadastra fornecedor',
  $$insert into public.suppliers (company_id, name) values ('5ec0c000-0000-4000-8000-000000000001', 'Do membro')$$);
do $$
begin
  if exists (select 1 from public.suppliers where company_id = '5ec0c000-0000-4000-8000-000000000001') then
    raise exception 'FALHA fornecedores: membro enxerga fornecedores' using errcode = 'P0002';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Numeração de orçamento: contador sumido ou atrasado não repete número (erro 23505 na tela).
-- ---------------------------------------------------------------------------
create temp table sec_quote_max on commit drop as
  select coalesce(max(number), 0) + 2 as top from public.quotes where company_id = '5ec0c000-0000-4000-8000-000000000001';
grant select on sec_quote_max to authenticated;
do $$
declare
  v_top integer := (select top from sec_quote_max);
  v_number integer;
begin
  insert into public.quotes (company_id, number) values
    ('5ec0c000-0000-4000-8000-000000000001', v_top - 1), ('5ec0c000-0000-4000-8000-000000000001', v_top);
  delete from public.company_counters where company_id = '5ec0c000-0000-4000-8000-000000000001';
  v_number := public.next_quote_number('5ec0c000-0000-4000-8000-000000000001');
  if v_number <> v_top + 1 then raise exception 'FALHA numeração: sem contador, deu % em vez de %', v_number, v_top + 1; end if;
  update public.company_counters set quote_number = 1 where company_id = '5ec0c000-0000-4000-8000-000000000001';
  v_number := public.next_quote_number('5ec0c000-0000-4000-8000-000000000001');
  -- Nenhum orçamento usou o número anterior: o maior existente continua sendo v_top.
  if v_number <> v_top + 1 then raise exception 'FALHA numeração: contador atrasado deu % em vez de %', v_number, v_top + 1; end if;
end $$;

-- O caminho da tela: o dono cria um orçamento novo com o contador atrasado.
update public.company_counters set quote_number = 1 where company_id = '5ec0c000-0000-4000-8000-000000000001';
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
do $$
declare
  v_quote uuid;
begin
  v_quote := public.save_quote('5ec0c000-0000-4000-8000-000000000001', null, null, null, 'Numeração', current_date + 15, 0, null, '[]'::jsonb);
  if (select number from public.quotes where id = v_quote) <> (select top from sec_quote_max) + 1 then
    raise exception 'FALHA numeração: orçamento novo repetiu número';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Custo do item no orçamento: só owner e admin veem; o membro não apaga ao editar; o link não mostra.
-- ---------------------------------------------------------------------------
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
create temp table sec_cost_quote on commit drop as
  select public.save_quote('5ec0c000-0000-4000-8000-000000000001', null, null, null, 'Revenda', current_date + 15, 0, null,
    '[{"description":"Serviço do parceiro","unit":"un","pricing_mode":"fixed","quantity":1,"people":1,"unit_price_cents":1020000,"cost_cents":850000}]'::jsonb) as id;
do $$
begin
  if (select c.cost_cents from public.quote_item_costs c join public.quote_items i on i.id = c.quote_item_id
      where i.quote_id = (select id from sec_cost_quote)) is distinct from 850000 then
    raise exception 'FALHA custo do item: o dono não gravou o custo';
  end if;
end $$;

reset role;
-- Membro próprio deste bloco: blocos anteriores mudam a situação do membro padrão.
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
values ('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Membro custo"}');
-- Só para montar o cenário: a trava de vagas do plano não é o que se testa aqui.
set local session_replication_role = replica;
insert into public.company_members (company_id, user_id, role) values ('5ec0c000-0000-4000-8000-000000000001', '5ec00000-0000-4000-8000-0000000000c1', 'member');
set local session_replication_role = origin;
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local');
do $$
begin
  if exists (select 1 from public.quote_item_costs) then
    raise exception 'FALHA custo do item: o membro enxerga custos';
  end if;
  -- O membro edita o rascunho (sem mandar custo): o custo do dono continua.
  perform public.save_quote('5ec0c000-0000-4000-8000-000000000001', (select id from sec_cost_quote), null, null, 'Revenda editada', current_date + 15, 0, null,
    '[{"description":"Serviço do parceiro","unit":"un","pricing_mode":"fixed","quantity":1,"people":1,"unit_price_cents":1100000,"cost_cents":1}]'::jsonb);
end $$;
reset role;
do $$
begin
  if (select c.cost_cents from public.quote_item_costs c join public.quote_items i on i.id = c.quote_item_id
      where i.quote_id = (select id from sec_cost_quote)) is distinct from 850000 then
    raise exception 'FALHA custo do item: edição do membro mudou ou apagou o custo';
  end if;
  update public.quotes set status = 'sent', public_token = coalesce(public_token, md5(random()::text) || md5(random()::text)) where id = (select id from sec_cost_quote);
  if public.get_public_quote((select public_token from public.quotes where id = (select id from sec_cost_quote)))::text ~ '850000|cost' then
    raise exception 'FALHA custo do item: o link do cliente mostra o custo';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Imposto do serviço: congela na aprovação; só owner e admin mudam, e só de serviço aprovado ou fechado.
-- ---------------------------------------------------------------------------
insert into public.clients (id, company_id, name) values ('5ec0e000-0000-4000-8000-000000000001', '5ec0c000-0000-4000-8000-000000000001', 'Cliente imposto');
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
update public.company_profiles set tax_regime = 'simples', tax_rate_bps = 843 where company_id = '5ec0c000-0000-4000-8000-000000000001';
insert into public.company_profiles (company_id, tax_regime, tax_rate_bps)
select '5ec0c000-0000-4000-8000-000000000001', 'simples', 843
where not exists (select 1 from public.company_profiles where company_id = '5ec0c000-0000-4000-8000-000000000001');
create temp table sec_tax_quote on commit drop as
  select public.save_quote('5ec0c000-0000-4000-8000-000000000001', null, '5ec0e000-0000-4000-8000-000000000001', null, 'Imposto', current_date + 15, 0, null,
    '[{"description":"Manutenção","unit":"un","pricing_mode":"fixed","quantity":1,"people":1,"unit_price_cents":100000}]'::jsonb) as id;
do $$
declare
  v_quote constant uuid := (select id from sec_tax_quote);
begin
  begin
    perform public.set_quote_tax_rate('5ec0c000-0000-4000-8000-000000000001', v_quote, 500);
    raise exception 'FALHA imposto: rascunho aceitou alíquota própria' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  perform public.transition_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 'send', current_date + 15);
  perform public.transition_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 'approve', null);
  if (select tax_rate_bps from public.quotes where id = v_quote) is distinct from 843 then
    raise exception 'FALHA imposto: a aprovação não congelou a alíquota da empresa';
  end if;
  update public.company_profiles set tax_rate_bps = 600 where company_id = '5ec0c000-0000-4000-8000-000000000001';
  if (select tax_rate_bps from public.quotes where id = v_quote) is distinct from 843 then
    raise exception 'FALHA imposto: mudar a alíquota da empresa mexeu no serviço já aprovado';
  end if;
  begin
    perform public.set_quote_tax_rate('5ec0c000-0000-4000-8000-000000000001', v_quote, 4001);
    raise exception 'FALHA imposto: aceitou alíquota acima de 40%%' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
end $$;
grant select on sec_tax_quote to authenticated;

-- Membro (o do bloco anterior) e outra empresa não mudam.
select sec_test.login('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local');
select sec_test.must_fail('membro muda imposto do serviço',
  format('select public.set_quote_tax_rate(%L, %L, 0)', '5ec0c000-0000-4000-8000-000000000001', (select id from sec_tax_quote)));
select sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
select sec_test.must_fail('outra empresa muda imposto do serviço',
  format('select public.set_quote_tax_rate(%L, %L, 0)', '5ec0c000-0000-4000-8000-000000000001', (select id from sec_tax_quote)));
select sec_test.login('5ec00000-0000-4000-8000-000000000002', 'sec-admin@test.local');
select public.set_quote_tax_rate('5ec0c000-0000-4000-8000-000000000001', (select id from sec_tax_quote), 500);
reset role;
do $$
begin
  if (select tax_rate_bps from public.quotes where id = (select id from sec_tax_quote)) is distinct from 500 then
    raise exception 'FALHA imposto: o administrador não conseguiu ajustar a alíquota do serviço';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Simples Nacional pelo RBT12: faixas, valor informado no lugar do lançado, Fator R, início de
-- atividade e congelamento na aprovação. Contas conferidas à mão pela tabela da LC 123.
-- ---------------------------------------------------------------------------
update public.company_profiles
set tax_regime = 'simples', tax_rate_auto = true, simples_annex = 'III', fator_r = false, activity_started_on = null
where company_id = '5ec0c000-0000-4000-8000-000000000001';
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
-- 12 meses de R$ 25.000,00: RBT12 de R$ 300.000,00, faixa 2 do Anexo III = 8,08%.
select public.save_monthly_revenues('5ec0c000-0000-4000-8000-000000000001', (
  select jsonb_agg(jsonb_build_object('month', (date_trunc('month', current_date) - make_interval(months => i))::date, 'amount_cents', 2500000))
  from generate_series(1, 12) as i
));
reset role;
create function sec_test.tax_rate() returns integer language sql as $$
  select public.effective_tax_rate_bps('5ec0c000-0000-4000-8000-000000000001');
$$;
do $$
begin
  if sec_test.tax_rate() <> 808 then raise exception 'FALHA RBT12: 12 meses de 25 mil deram % em vez de 808', sec_test.tax_rate(); end if;
  -- Lançado no sistema no mês passado: o informado continua valendo.
  insert into public.revenues (company_id, quote_id, amount_cents, competence_date)
  values ('5ec0c000-0000-4000-8000-000000000001', (select id from sec_tax_quote), 1000000, (date_trunc('month', current_date) - interval '1 month')::date + 4);
  if sec_test.tax_rate() <> 808 then raise exception 'FALHA RBT12: o lançado passou por cima do informado'; end if;
end $$;
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
select public.save_monthly_revenues('5ec0c000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('month', (date_trunc('month', current_date) - interval '1 month')::date, 'amount_cents', null)));
do $$
begin
  begin
    perform public.save_monthly_revenues('5ec0c000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object('month', date_trunc('month', current_date)::date, 'amount_cents', 100)));
    raise exception 'FALHA RBT12: aceitou faturamento do mês corrente' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  if (public.get_company_tax('5ec0c000-0000-4000-8000-000000000001') ->> 'rate_bps')::integer is distinct from 792 then
    raise exception 'FALHA RBT12: sem o informado, o mês com R$ 10 mil lançados não entrou';
  end if;
end $$;
reset role;
do $$
begin
  -- RBT12 de R$ 285.000,00: Anexo V faixa 2 = 16,42%; com Fator R vai para o Anexo III (7,92%).
  update public.company_profiles set simples_annex = 'V' where company_id = '5ec0c000-0000-4000-8000-000000000001';
  if sec_test.tax_rate() <> 1642 then raise exception 'FALHA RBT12: Anexo V deu %', sec_test.tax_rate(); end if;
  update public.company_profiles set fator_r = true where company_id = '5ec0c000-0000-4000-8000-000000000001';
  if sec_test.tax_rate() <> 792 then raise exception 'FALHA RBT12: Fator R não levou ao Anexo III'; end if;
  -- 3 meses de atividade (25 mil, 25 mil e 10 mil): média × 12 = R$ 240.000,00, 7,30%.
  update public.company_profiles set simples_annex = 'III', fator_r = false,
    activity_started_on = (date_trunc('month', current_date) - interval '3 months')::date + 9
  where company_id = '5ec0c000-0000-4000-8000-000000000001';
  if sec_test.tax_rate() <> 730 then raise exception 'FALHA RBT12: início de atividade deu %', sec_test.tax_rate(); end if;
  -- Primeiro mês de atividade: primeira faixa.
  update public.company_profiles set activity_started_on = current_date where company_id = '5ec0c000-0000-4000-8000-000000000001';
  if sec_test.tax_rate() <> 600 then raise exception 'FALHA RBT12: primeiro mês deu %', sec_test.tax_rate(); end if;
  update public.company_profiles set activity_started_on = null where company_id = '5ec0c000-0000-4000-8000-000000000001';
  -- Automático só no Simples, com anexo.
  begin
    update public.company_profiles set tax_regime = 'other' where company_id = '5ec0c000-0000-4000-8000-000000000001';
    raise exception 'FALHA RBT12: automático fora do Simples' using errcode = 'P0002';
  exception when check_violation then null;
  end;
end $$;
-- A aprovação congela a alíquota calculada do mês.
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
create temp table sec_auto_quote on commit drop as
  select public.save_quote('5ec0c000-0000-4000-8000-000000000001', null, '5ec0e000-0000-4000-8000-000000000001', null, 'Automático', current_date + 15, 0, null,
    '[{"description":"Manutenção","unit":"un","pricing_mode":"fixed","quantity":1,"people":1,"unit_price_cents":100000}]'::jsonb) as id;
do $$
begin
  perform public.transition_quote('5ec0c000-0000-4000-8000-000000000001', (select id from sec_auto_quote), 'send', current_date + 15);
  perform public.transition_quote('5ec0c000-0000-4000-8000-000000000001', (select id from sec_auto_quote), 'approve', null);
  if (select tax_rate_bps from public.quotes where id = (select id from sec_auto_quote)) is distinct from 792 then
    raise exception 'FALHA RBT12: a aprovação não congelou a alíquota calculada';
  end if;
end $$;
-- Faturamento é só de owner e admin.
select sec_test.login('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local');
select sec_test.must_fail('membro lê o cálculo do imposto', format('select public.get_company_tax(%L)', '5ec0c000-0000-4000-8000-000000000001'));
select sec_test.must_fail('membro informa faturamento',
  format('select public.save_monthly_revenues(%L, %L::jsonb)', '5ec0c000-0000-4000-8000-000000000001', '[]'));
do $$
begin
  if exists (select 1 from public.company_monthly_revenues) then raise exception 'FALHA RBT12: o membro lê o faturamento informado'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Aprovação pelo link: exige assinatura na pasta do orçamento; só o servidor responde; só o
-- escritório da empresa lê o arquivo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = (select id from sec_cost_quote);
  if v_quote.status <> 'sent' then raise exception 'FALHA assinatura: cenário sem orçamento enviado'; end if;
  begin
    perform public.respond_public_quote(v_quote.public_token, 'approved', 'Cliente', '', null);
    raise exception 'FALHA assinatura: aprovou sem assinatura' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  begin
    perform public.respond_public_quote(v_quote.public_token, 'approved', 'Cliente', '', '5ec0c000-0000-4000-8000-000000000002/outro/a.png');
    raise exception 'FALHA assinatura: aceitou arquivo fora da pasta do orçamento' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  perform public.respond_public_quote(v_quote.public_token, 'approved', 'Cliente', '', v_quote.company_id || '/' || v_quote.id || '/assinatura.png');
  if (select signature_path from public.quote_responses where quote_id = v_quote.id and decision = 'approved')
     is distinct from v_quote.company_id || '/' || v_quote.id || '/assinatura.png' then
    raise exception 'FALHA assinatura: não gravou o caminho da assinatura';
  end if;
  if has_function_privilege('authenticated', 'public.respond_public_quote(text, text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.respond_public_quote(text, text, text, text, text)', 'execute') then
    raise exception 'FALHA assinatura: usuário responde o link direto, sem o servidor';
  end if;
end $$;
create temp table sec_signature_path on commit drop as
  select q.company_id || '/' || q.id || '/assinatura.png' as name from public.quotes q where q.id = (select id from sec_cost_quote);
grant select on sec_signature_path to authenticated;
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000002', 'sec-admin@test.local');
do $$
begin
  if not public.can_read_quote_signature((select name from sec_signature_path)) then
    raise exception 'FALHA assinatura: o escritório não abre a assinatura';
  end if;
end $$;
select sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
do $$
begin
  if public.can_read_quote_signature((select name from sec_signature_path)) then
    raise exception 'FALHA assinatura: outra empresa abre a assinatura';
  end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('INSERT', 'UPDATE', 'DELETE') and (qual like '%quote-signatures%' or with_check like '%quote-signatures%')) then
    raise exception 'FALHA assinatura: usuário grava no bucket das assinaturas';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recebimentos: as parcelas somam o fechado; baixa parcial deixa o restante a receber; desfazer o
-- fechamento tira as parcelas; só owner e admin leem e dão baixa.
-- ---------------------------------------------------------------------------
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
do $$
declare
  v_quote constant uuid := (select id from sec_auto_quote);
  v_entry uuid;
  v_rest uuid;
  -- A data da empresa, no fuso dela: perto da meia-noite, current_date (UTC) já é amanhã.
  v_today constant date := public.company_today('5ec0c000-0000-4000-8000-000000000001');
begin
  begin
    perform public.close_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 100000, v_today,
      '[{"amount_cents":30000,"due_date":"2026-01-01","method":"pix","received":true},{"amount_cents":60000,"due_date":"2026-02-01","method":"boleto","received":false}]'::jsonb);
    raise exception 'FALHA recebimentos: aceitou parcelas que não somam o fechado' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  perform public.close_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 100000, v_today, jsonb_build_array(
    jsonb_build_object('amount_cents', 40000, 'due_date', v_today, 'method', 'pix', 'received', true),
    jsonb_build_object('amount_cents', 60000, 'due_date', v_today + 30, 'method', 'boleto', 'received', false)
  ));
  if (select count(*) from public.receivables where quote_id = v_quote) <> 2
     or (select sum(received_cents) from public.receivables where quote_id = v_quote) <> 40000 then
    raise exception 'FALHA recebimentos: o fechamento não gravou as parcelas';
  end if;

  select id into v_rest from public.receivables where quote_id = v_quote and received_on is null;
  begin
    perform public.receive_installment('5ec0c000-0000-4000-8000-000000000001', v_rest, v_today + 1, 1000, null, null);
    raise exception 'FALHA recebimentos: aceitou recebimento no futuro' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  begin
    perform public.receive_installment('5ec0c000-0000-4000-8000-000000000001', v_rest, v_today, 60001, null, null);
    raise exception 'FALHA recebimentos: aceitou receber mais que a parcela' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  -- Recebeu 25 mil de 60 mil: os 35 mil restantes viram parcela nova.
  perform public.receive_installment('5ec0c000-0000-4000-8000-000000000001', v_rest, v_today, 25000, 'cash', v_today + 60);
  if (select sum(amount_cents) from public.receivables where quote_id = v_quote) <> 100000
     or (select amount_cents from public.receivables where quote_id = v_quote and received_on is null) <> 35000
     or (select due_date from public.receivables where quote_id = v_quote and received_on is null) <> v_today + 60 then
    raise exception 'FALHA recebimentos: baixa parcial não deixou o restante a receber';
  end if;

  select id into v_entry from public.receivables where quote_id = v_quote and received_cents = 25000;
  perform public.undo_receive_installment('5ec0c000-0000-4000-8000-000000000001', v_entry);
  if (select received_on from public.receivables where id = v_entry) is not null then
    raise exception 'FALHA recebimentos: desfazer a baixa não voltou a parcela';
  end if;
  begin
    perform public.reschedule_installment('5ec0c000-0000-4000-8000-000000000001',
      (select id from public.receivables where quote_id = v_quote and received_cents = 40000), v_today + 5, null);
    raise exception 'FALHA recebimentos: reagendou parcela já recebida' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
end $$;
-- Membro não lê nem dá baixa.
select sec_test.login('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local');
do $$
begin
  if exists (select 1 from public.receivables) then raise exception 'FALHA recebimentos: o membro lê as parcelas'; end if;
end $$;
reset role;
create temp table sec_receivable on commit drop as
  select id from public.receivables where quote_id = (select id from sec_auto_quote) and received_on is null limit 1;
grant select on sec_receivable to authenticated;
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local');
select sec_test.must_fail('membro dá baixa em parcela',
  format('select public.receive_installment(%L, %L, public.company_today(%L), 1, null, null)', '5ec0c000-0000-4000-8000-000000000001', (select id from sec_receivable), '5ec0c000-0000-4000-8000-000000000001'));
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
do $$
begin
  perform public.undo_close_quote('5ec0c000-0000-4000-8000-000000000001', (select id from sec_auto_quote));
  if exists (select 1 from public.receivables where quote_id = (select id from sec_auto_quote)) then
    raise exception 'FALHA recebimentos: desfazer o fechamento deixou parcelas';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Recebimentos, etapa 2: condições no orçamento (só rascunho), taxa da maquininha como parte da
-- parcela e regime de caixa no RBT12.
-- ---------------------------------------------------------------------------
update public.company_profiles set card_fee_credit_bps = 349, card_fee_debit_bps = 199
where company_id = '5ec0c000-0000-4000-8000-000000000001';
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
create temp table sec_plan_quote on commit drop as
  select public.save_quote('5ec0c000-0000-4000-8000-000000000001', null, '5ec0e000-0000-4000-8000-000000000001', null, 'Condições', current_date + 15, 0, null,
    '[{"description":"Instalação","unit":"un","pricing_mode":"fixed","quantity":1,"people":1,"unit_price_cents":100000}]'::jsonb) as id;
do $$
declare
  v_quote constant uuid := (select id from sec_plan_quote);
  v_today constant date := public.company_today('5ec0c000-0000-4000-8000-000000000001');
  v_card uuid;
begin
  begin
    perform public.set_quote_payment_plan('5ec0c000-0000-4000-8000-000000000001', v_quote, '{"kind":"fiado","count":1}'::jsonb);
    raise exception 'FALHA condições: aceitou forma de plano desconhecida' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  perform public.set_quote_payment_plan('5ec0c000-0000-4000-8000-000000000001', v_quote,
    '{"kind":"entry","method":"boleto","entry_cents":20000,"entry_method":"pix","count":2,"extra":"x"}'::jsonb);
  if (select payment_plan ->> 'extra' from public.quotes where id = v_quote) is not null
     or (select (payment_plan ->> 'entry_cents')::integer from public.quotes where id = v_quote) <> 20000 then
    raise exception 'FALHA condições: não normalizou o plano';
  end if;
  v_card := public.duplicate_quote('5ec0c000-0000-4000-8000-000000000001', v_quote);
  if (select payment_plan from public.quotes where id = v_card) is null then
    raise exception 'FALHA condições: duplicar não levou as condições';
  end if;

  perform public.transition_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 'send', current_date + 15);
  begin
    perform public.set_quote_payment_plan('5ec0c000-0000-4000-8000-000000000001', v_quote, null);
    raise exception 'FALHA condições: mudou condições de orçamento enviado' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  perform public.transition_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 'approve', null);

  -- Cartão: 3,49% de taxa em cada parcela; recebida, entra no caixa sem a taxa.
  perform public.close_quote('5ec0c000-0000-4000-8000-000000000001', v_quote, 100000, v_today, jsonb_build_array(
    jsonb_build_object('amount_cents', 40000, 'due_date', v_today, 'method', 'credit', 'received', true),
    jsonb_build_object('amount_cents', 60000, 'due_date', v_today + 30, 'method', 'credit', 'received', false)
  ));
  if (select fee_cents from public.receivables where quote_id = v_quote and amount_cents = 40000) <> 1396
     or (select received_cents from public.receivables where quote_id = v_quote and amount_cents = 40000) <> 38604 then
    raise exception 'FALHA taxa: a parcela recebida no cartão não descontou a taxa';
  end if;
  -- Esperado 57.906 (60.000 − 2.094); entrou 30.000: o restante (27.906) vira parcela sem taxa.
  select id into v_card from public.receivables where quote_id = v_quote and amount_cents = 60000;
  perform public.receive_installment('5ec0c000-0000-4000-8000-000000000001', v_card, v_today, 30000, null, v_today + 10);
  if (select amount_cents from public.receivables where id = v_card) <> 32094
     or (select sum(amount_cents) from public.receivables where quote_id = v_quote) <> 100000
     or (select amount_cents from public.receivables where quote_id = v_quote and received_on is null) <> 27906 then
    raise exception 'FALHA taxa: baixa parcial no cartão não fechou a conta';
  end if;
  -- Mudar a forma de uma parcela a receber recalcula a taxa.
  perform public.reschedule_installment('5ec0c000-0000-4000-8000-000000000001',
    (select id from public.receivables where quote_id = v_quote and received_on is null), v_today + 10, 'debit');
  if (select fee_cents from public.receivables where quote_id = v_quote and received_on is null) <> 555 then
    raise exception 'FALHA taxa: reagendar no débito não recalculou a taxa';
  end if;
end $$;
reset role;
-- O link do cliente (só o servidor chama) mostra as condições combinadas.
do $$
begin
  if (public.get_public_quote((select public_token from public.quotes where id = (select id from sec_plan_quote))) -> 'payment_plan' ->> 'kind') is distinct from 'entry' then
    raise exception 'FALHA condições: o link não mostra as condições';
  end if;
end $$;
-- Regime de caixa: o mês conta o que entrou (com a taxa, que o cliente pagou), não o faturado.
do $$
declare
  v_month constant date := date_trunc('month', public.company_today('5ec0c000-0000-4000-8000-000000000001'))::date;
begin
  if public.tax_month_revenue_cents('5ec0c000-0000-4000-8000-000000000001', v_month, false)
     < public.tax_month_revenue_cents('5ec0c000-0000-4000-8000-000000000001', v_month, true) then
    raise exception 'FALHA caixa: neste mês o recebido não pode passar do faturado';
  end if;
  if public.tax_month_revenue_cents('5ec0c000-0000-4000-8000-000000000001', v_month, true)
     <> (select coalesce(sum(received_cents + fee_cents), 0) from public.receivables
         where company_id = '5ec0c000-0000-4000-8000-000000000001' and deleted_at is null
           and received_on >= v_month and received_on < v_month + interval '1 month') then
    raise exception 'FALHA caixa: o RBT12 pelo caixa não somou o recebido';
  end if;
  if has_function_privilege('authenticated', 'public.card_fee_cents(uuid, text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.tax_month_revenue_cents(uuid, date, boolean)', 'execute') then
    raise exception 'FALHA caixa: função interna aberta ao usuário';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Importação de clientes: tudo ou nada; contato principal e local junto; respeita as policies.
-- ---------------------------------------------------------------------------
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
do $$
declare
  v_before integer := (select count(*) from public.clients where company_id = '5ec0c000-0000-4000-8000-000000000001');
begin
  begin
    perform public.import_clients('5ec0c000-0000-4000-8000-000000000001', '[
      {"name":"Importado Um","document":null,"notes":null,"contact":null,"location":null},
      {"name":"","document":null,"notes":null,"contact":null,"location":null}
    ]'::jsonb);
    raise exception 'FALHA importação: aceitou cliente sem nome' using errcode = 'P0002';
  exception when raise_exception then null;
  end;
  if (select count(*) from public.clients where company_id = '5ec0c000-0000-4000-8000-000000000001') <> v_before then
    raise exception 'FALHA importação: linha com erro deixou parte gravada';
  end if;

  if public.import_clients('5ec0c000-0000-4000-8000-000000000001', '[
    {"name":"Importado Um","document":"12345678000190","notes":"manhã","contact":{"name":"João","phone":"(14) 99999-0000","email":"joao@x.com"},"location":{"name":"Principal","address":"Rua A, 10 - Bauru/SP"}},
    {"name":"Importado Dois","document":null,"notes":null,"contact":null,"location":null}
  ]'::jsonb) <> 2 then
    raise exception 'FALHA importação: não importou os dois clientes';
  end if;
  if not exists (
    select 1 from public.clients c
    join public.client_contacts cc on cc.client_id = c.id and cc.is_primary and cc.phone = '(14) 99999-0000'
    join public.client_locations l on l.client_id = c.id and l.address = 'Rua A, 10 - Bauru/SP'
    where c.company_id = '5ec0c000-0000-4000-8000-000000000001' and c.name = 'Importado Um'
  ) then
    raise exception 'FALHA importação: contato principal ou local não gravado';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Isolamento entre empresas: vale para toda tabela e função, inclusive as que forem criadas.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_rows bigint;
  v_args text;
  v_result text;
  v_func record;
  v_victim constant uuid := '5ec0c000-0000-4000-8000-000000000001';
  -- Não abrem dado da empresa: só respondem false, um fuso, ou agem sobre o próprio usuário.
  v_harmless constant text[] := array[
    'company_today', 'company_now_time', 'is_company_admin', 'is_company_member', 'is_company_office', 'is_company_owner',
    'leave_company'
  ];
begin
  perform sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
  set local role authenticated;
  for v_table in
    select c.table_name from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'company_id' and t.table_type = 'BASE TABLE'
  loop
    begin
      execute format('select count(*) from public.%I where company_id = %L', v_table, v_victim) into v_rows;
      if v_rows > 0 then raise exception 'FALHA isolamento: outra empresa lê % (% linhas)', v_table, v_rows using errcode = 'P0002'; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('update public.%I set company_id = company_id where company_id = %L', v_table, v_victim);
      get diagnostics v_rows = row_count;
      if v_rows > 0 then raise exception 'FALHA isolamento: outra empresa altera % (% linhas)', v_table, v_rows using errcode = 'P0002'; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('delete from public.%I where company_id = %L', v_table, v_victim);
      get diagnostics v_rows = row_count;
      if v_rows > 0 then raise exception 'FALHA isolamento: outra empresa apaga % (% linhas)', v_table, v_rows using errcode = 'P0002'; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;

  for v_func in
    select p.proname, p.proargtypes from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proargnames[1] = 'p_company_id'
      and has_function_privilege('authenticated', p.oid, 'execute') and not p.proname = any (v_harmless)
  loop
    select string_agg(case when ord = 1 then quote_literal(v_victim) || '::uuid' else 'null::' || format_type(type_oid, null) end, ', ' order by ord)
    into v_args from unnest(v_func.proargtypes::oid[]) with ordinality as args(type_oid, ord);
    begin
      execute format('select to_jsonb(r)::text from public.%I(%s) r', v_func.proname, v_args) into v_result;
      -- Só pode responder vazio: qualquer conteúdo seria dado de outra empresa.
      if coalesce(v_result, 'null') not in ('null', '[]', '{}') then
        raise exception 'FALHA isolamento: % devolveu dados a outra empresa: %', v_func.proname, left(v_result, 80) using errcode = 'P0002';
      end if;
    exception when insufficient_privilege or raise_exception then null;
    end;
  end loop;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- Cadastro em etapas: nome e e-mail de quem começou o cadastro só o super admin lê; ninguém grava
-- pela API, nem anônimo nem logado.
-- ---------------------------------------------------------------------------
reset role;
insert into public.signup_leads (email, full_name, accepted_at)
values ('lead@test.local', 'Pessoa Lead', now());
insert into public.platform_admins (user_id) values ('5ec00000-0000-4000-8000-000000000006');
grant usage on schema sec_test to anon;
grant execute on all functions in schema sec_test to anon;

set local role anon;
select sec_test.must_fail('anônimo lê cadastros iniciados', $$select * from public.signup_leads$$);
select sec_test.must_fail('anônimo grava cadastro iniciado',
  $$insert into public.signup_leads (email, full_name, accepted_at) values ('x@test.local', 'Xx', now())$$);

set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
select sec_test.must_fail('usuário comum lê cadastros iniciados', $$select * from public.signup_leads$$);
select sec_test.must_fail('usuário comum grava cadastro iniciado',
  $$insert into public.signup_leads (email, full_name, accepted_at) values ('y@test.local', 'Yy', now())$$);
select sec_test.must_fail('usuário comum altera cadastro iniciado', $$update public.signup_leads set stage = 'done'$$);
select sec_test.must_fail('usuário comum apaga cadastro iniciado', $$delete from public.signup_leads$$);
select sec_test.must_fail('usuário comum apaga cadastros antigos', $$select public.purge_old_signup_leads()$$);

select sec_test.login('5ec00000-0000-4000-8000-000000000006', 'sec-guest@test.local');
select sec_test.must_pass('super admin lê cadastros iniciados', $$select * from public.signup_leads$$);
select sec_test.must_fail('super admin grava cadastro iniciado pela API', $$update public.signup_leads set stage = 'done'$$);
reset role;
delete from public.platform_admins where user_id = '5ec00000-0000-4000-8000-000000000006';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Prevenção de fraude: provas só o super admin lê e ninguém grava pela API; a empresa suspensa
-- não se reativa, e o link do orçamento dela não abre.
-- ---------------------------------------------------------------------------
reset role;
insert into public.company_declarations (company_id, user_name, user_email, company_name, statement)
values ('5ec0c000-0000-4000-8000-000000000001', 'Owner', 'sec-owner@test.local', 'Pro', 'Declaro que sou responsável.');
update public.companies set suspended_at = now(), suspension_reason = 'Teste de suspensão'
where id = '5ec0c000-0000-4000-8000-000000000002';
set local role authenticated;

select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
select sec_test.must_fail('owner lê a própria declaração direto', $$select * from public.company_declarations$$);
select sec_test.must_fail('owner forja declaração',
  $$insert into public.company_declarations (company_id, user_name, user_email, company_name, statement)
    values ('5ec0c000-0000-4000-8000-000000000001', 'X', 'x@x', 'Pro', 'falsa')$$);
select sec_test.must_fail('owner apaga declaração', $$delete from public.company_declarations$$);
select sec_test.must_fail('owner forja conferência de CNPJ',
  $$insert into public.company_cnpj_checks (company_id, cnpj, informed_name, result, source)
    values ('5ec0c000-0000-4000-8000-000000000001', '11222333000181', 'Pro', 'match', 'forjado')$$);
select sec_test.must_fail('owner apaga denúncia', $$delete from public.abuse_reports$$);
select sec_test.must_fail('owner se suspende ou mexe na suspensão',
  $$update public.companies set suspended_at = now() where id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('owner muda a etapa do próprio cadastro',
  $$update public.companies set onboarding_pending = not onboarding_pending where id = '5ec0c000-0000-4000-8000-000000000001'$$);

select sec_test.login('5ec00000-0000-4000-8000-000000000005', 'sec-free@test.local');
select sec_test.must_fail('empresa suspensa se reativa',
  $$update public.companies set suspended_at = null, suspension_reason = null where id = '5ec0c000-0000-4000-8000-000000000002'$$);

reset role;
do $$
begin
  insert into public.clients (id, company_id, name) values ('5ec0d000-0000-4000-8000-000000000001', '5ec0c000-0000-4000-8000-000000000001', 'Cliente Pro');
  insert into public.quotes (id, company_id, client_id, number, status, public_token, valid_until)
  values ('5ec0e000-0000-4000-8000-000000000001', '5ec0c000-0000-4000-8000-000000000001', '5ec0d000-0000-4000-8000-000000000001', 9001, 'sent', repeat('a', 64), current_date + 10);
  if public.get_public_quote(repeat('a', 64)) is null then
    raise exception 'FALHA fraude: link do orçamento de empresa ativa não abriu';
  end if;
  update public.companies set suspended_at = now(), suspension_reason = 'Teste de suspensão'
  where id = '5ec0c000-0000-4000-8000-000000000001';
  if public.get_public_quote(repeat('a', 64)) is not null then
    raise exception 'FALHA fraude: link do orçamento de empresa suspensa abriu';
  end if;
  update public.companies set suspended_at = null, suspension_reason = null where id = '5ec0c000-0000-4000-8000-000000000001';
end $$;
update public.companies set suspended_at = null, suspension_reason = null where id = '5ec0c000-0000-4000-8000-000000000002';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Foto de perfil desligada: ninguém grava foto no bucket nem o link dela no perfil; o nome segue.
-- ---------------------------------------------------------------------------
select sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
select sec_test.must_fail('usuário grava foto de perfil no bucket',
  $$insert into storage.objects (bucket_id, name) values ('avatars', '5ec00000-0000-4000-8000-000000000004/avatar.png')$$);
select sec_test.must_fail('usuário grava link de foto no perfil',
  $$update public.profiles set avatar_url = 'https://exemplo.com/rastreador.png' where id = '5ec00000-0000-4000-8000-000000000004'$$);

-- ---------------------------------------------------------------------------
-- Logo da empresa: o caminho só aponta para a pasta da própria empresa, e o arquivo só o servidor
-- grava. Sem isso, um owner exibiria nos PDFs dele a imagem de outra empresa (ou outro arquivo).
-- ---------------------------------------------------------------------------
reset role;
insert into public.company_profiles (company_id) values ('5ec0c000-0000-4000-8000-000000000001') on conflict (company_id) do nothing;
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000001', 'sec-owner@test.local');
select sec_test.must_fail('owner aponta o logo para a pasta de outra empresa',
  $$update public.company_profiles set logo_path = '5ec0c000-0000-4000-8000-000000000002/5ec0c000-0000-4000-8000-0000000000aa.png'
    where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('owner aponta o logo para fora do padrão',
  $$update public.company_profiles set logo_path = '5ec0c000-0000-4000-8000-000000000001/../avatars/x.png'
    where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('owner grava arquivo no bucket de logos pela API',
  $$insert into storage.objects (bucket_id, name) values ('company-logos', '5ec0c000-0000-4000-8000-000000000001/5ec0c000-0000-4000-8000-0000000000bb.png')$$);
select sec_test.must_pass('owner aponta o logo para a pasta da própria empresa',
  $$update public.company_profiles set logo_path = '5ec0c000-0000-4000-8000-000000000001/5ec0c000-0000-4000-8000-0000000000cc.png'
    where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);

-- ---------------------------------------------------------------------------
-- P-08: o técnico não lê os dados financeiros da empresa. A tabela company_profiles
-- é lida via RLS só pelo escritório (owner/admin/member); o técnico recebe o
-- subconjunto de contato por get_company_doc_profile, sem imposto, taxa de
-- cartão nem margem. Neste ponto o perfil da Pro já tem imposto, taxa e logo.
-- ---------------------------------------------------------------------------
-- Reaproveita o cost-member (rebaixado a técnico; não ocupa vaga nova e não é usado depois).
reset role;
update public.company_members set role = 'technician'
where company_id = '5ec0c000-0000-4000-8000-000000000001' and user_id = '5ec00000-0000-4000-8000-0000000000c1';
set local role authenticated;

select sec_test.login('5ec00000-0000-4000-8000-0000000000c1', 'sec-cost-member@test.local');
select sec_test.must_fail('técnico lê o perfil da empresa direto',
  $$select * from public.company_profiles where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_pass('técnico lê o subconjunto de contato',
  $$select public.get_company_doc_profile('5ec0c000-0000-4000-8000-000000000001')$$);
do $$
declare
  v jsonb := public.get_company_doc_profile('5ec0c000-0000-4000-8000-000000000001');
begin
  if v ?| array['tax_rate_bps', 'tax_regime', 'simples_annex', 'fator_r', 'card_fee_credit_bps', 'card_fee_debit_bps', 'target_margin_percent'] then
    raise exception 'FALHA P-08: o subconjunto de contato trouxe dado financeiro: %', v;
  end if;
  if (v ->> 'timezone') is null then
    raise exception 'FALHA P-08: o subconjunto de contato veio sem os dados de contato';
  end if;
end $$;

-- Escritório (owner, admin, member) segue lendo a tabela inteira. Garante o papel
-- de 003, que blocos anteriores podem ter alterado.
reset role;
update public.company_members set role = 'member'
where company_id = '5ec0c000-0000-4000-8000-000000000001' and user_id = '5ec00000-0000-4000-8000-000000000003';
set local role authenticated;
select sec_test.login('5ec00000-0000-4000-8000-000000000003', 'sec-member@test.local');
select sec_test.must_pass('escritório lê o perfil da empresa',
  $$select * from public.company_profiles where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);

-- Estranho não lê nem a tabela nem o subconjunto.
select sec_test.login('5ec00000-0000-4000-8000-000000000004', 'sec-stranger@test.local');
select sec_test.must_fail('estranho lê o perfil da empresa direto',
  $$select * from public.company_profiles where company_id = '5ec0c000-0000-4000-8000-000000000001'$$);
select sec_test.must_fail('estranho lê o subconjunto de contato',
  $$select public.get_company_doc_profile('5ec0c000-0000-4000-8000-000000000001')$$);
reset role;

-- ---------------------------------------------------------------------------
-- Invariantes: valem para o que for criado daqui para a frente.
-- ---------------------------------------------------------------------------
do $$
declare
  v_list text;
begin
  -- Toda tabela do schema public tem RLS.
  select string_agg(c.relname, ', ') into v_list
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  if v_list is not null then raise exception 'FALHA invariante: tabela sem RLS: %', v_list; end if;

  -- Tabela com company_id acessível ao usuário tem policy. Sem GRANT (só RPCs usam) não precisa.
  select string_agg(c.relname, ', ') into v_list
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and has_table_privilege('authenticated', c.oid, 'select, insert, update, delete')
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
  if v_list is not null then raise exception 'FALHA invariante: tabela de empresa sem policy: %', v_list; end if;

  -- Security definer sem search_path fixo pode ser sequestrada.
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if v_list is not null then raise exception 'FALHA invariante: security definer sem search_path: %', v_list; end if;

  -- Tabelas que só o servidor escreve.
  select string_agg(table_name || ' ' || privilege_type, ', ') into v_list
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and (
      (table_name in ('subscriptions', 'audit_logs', 'plans', 'platform_admins', 'plan_audit_log',
        'terms_acceptances', 'user_consents', 'signup_leads', 'company_declarations', 'company_cnpj_checks',
        'abuse_reports', 'company_suspension_events')
        and privilege_type <> 'SELECT')
      or (table_name = 'company_members' and privilege_type not in ('SELECT', 'UPDATE'))
    );
  if v_list is not null then raise exception 'FALHA invariante: escrita aberta: %', v_list; end if;

  -- Criar empresa para outra pessoa é só do servidor.
  if has_function_privilege('authenticated', 'public.admin_create_company(text, text, uuid, uuid, uuid)', 'execute') then
    raise exception 'FALHA invariante: usuário comum cria empresa para outra pessoa';
  end if;

  -- Travas que não podem sumir em uma migration futura.
  select string_agg(expected.name, ', ') into v_list
  from unnest(array[
    'guard_company_member_write', 'guard_company_invite_write', 'guard_company_write',
    'enforce_seat_limit', 'enforce_client_limit', 'enforce_quote_limit', 'enforce_plan_feature',
    'set_subscription_contract'
  ]) as expected(name)
  where not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace and t.tgname = expected.name and t.tgenabled <> 'D'
  );
  if v_list is not null then raise exception 'FALHA invariante: trigger de segurança ausente: %', v_list; end if;
end $$;

rollback;

\echo 'Regressão de segurança: todos os ataques barrados.'
