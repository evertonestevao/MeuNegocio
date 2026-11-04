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
        'terms_acceptances', 'user_consents')
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
