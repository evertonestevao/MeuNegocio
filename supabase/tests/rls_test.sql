-- Testes de RLS (plano §6/§12): prova em banco real que um tenant não lê nem
-- escreve dados de outro. Roda dentro de uma transação com ROLLBACK final —
-- não deixa lixo no banco. Qualquer falha aborta com RAISE EXCEPTION.
--
-- Uso: npm run test:rls (com o Supabase local de pé).

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Seed (como superuser, RLS ignorada de propósito): 2 usuários, 2 empresas.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'rls-alice@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Alice RLS"}'),
  ('b2b2b2b2-0000-4000-8000-000000000002', 'rls-bob@test.local',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Bob RLS"}');

insert into public.companies (id, name, slug, created_by) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'Alice Co', 'rls-alice-co', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'Bob Co',   'rls-bob-co',   'b2b2b2b2-0000-4000-8000-000000000002');

insert into public.company_members (company_id, user_id, role) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'owner'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 'owner');

insert into public.settings (company_id, key, value) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'rls-test', '"alice"'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'rls-test', '"bob"');

insert into public.audit_logs (company_id, user_id, action) values
  ('c2c2c2c2-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 'rls.test');

insert into public.subscriptions (company_id, plan_id, status)
select 'c2c2c2c2-0000-4000-8000-000000000002', id, 'active' from public.plans where code = 'pro';

insert into public.company_invites (company_id, email, role, invited_by) values
  ('c2c2c2c2-0000-4000-8000-000000000002', 'convidado@test.local', 'member', 'b2b2b2b2-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Sessão da ALICE: só pode enxergar/alterar o próprio tenant.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- companies: vê a própria, não vê a do outro tenant
  select count(*) into n from public.companies;
  if n <> 1 then raise exception 'FALHA companies: alice deveria ver 1 empresa, viu %', n; end if;
  select count(*) into n from public.companies where id = 'c2c2c2c2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA companies: alice enxerga a empresa do bob'; end if;

  -- company_members: só a membership do próprio tenant
  select count(*) into n from public.company_members;
  if n <> 1 then raise exception 'FALHA company_members: esperado 1, veio %', n; end if;

  -- settings / audit_logs / subscriptions / company_invites de outro tenant: invisíveis
  select count(*) into n from public.settings where company_id = 'c2c2c2c2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA settings: vazou linha de outro tenant'; end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'FALHA audit_logs: vazou linha de outro tenant'; end if;
  select count(*) into n from public.subscriptions;
  if n <> 0 then raise exception 'FALHA subscriptions: vazou linha de outro tenant'; end if;
  select count(*) into n from public.company_invites;
  if n <> 0 then raise exception 'FALHA company_invites: vazou convite de outro tenant'; end if;

  -- profiles: vê o próprio, não vê o de quem não divide empresa
  select count(*) into n from public.profiles where id = 'b2b2b2b2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA profiles: alice ve profile de estranho'; end if;
end $$;

-- Escrita cross-tenant deve estourar RLS (42501) — nunca passar em silêncio.
do $$
begin
  begin
    insert into public.settings (company_id, key, value)
    values ('c2c2c2c2-0000-4000-8000-000000000002', 'invasao', '"x"');
    raise exception 'FALHA settings: INSERT cross-tenant foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    insert into public.audit_logs (company_id, user_id, action)
    values ('c2c2c2c2-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'invasao');
    raise exception 'FALHA audit_logs: INSERT cross-tenant foi aceito';
  exception when sqlstate '42501' then null;
  end;

  begin
    insert into public.company_members (company_id, user_id, role)
    values ('c2c2c2c2-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'admin');
    raise exception 'FALHA company_members: alice se auto-inseriu no tenant do bob';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- UPDATE cross-tenant não deve afetar nenhuma linha (a policy filtra o alvo).
do $$
declare n int;
begin
  update public.companies set name = 'Hackeada'
  where id = 'c2c2c2c2-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA companies: UPDATE cross-tenant afetou % linha(s)', n; end if;

  -- Papel owner só muda por transfer_company_ownership, nem na própria linha.
  begin
    update public.company_members set role = 'owner'
    where user_id = 'a1a1a1a1-0000-4000-8000-000000000001';
    raise exception 'FALHA company_members: UPDATE direto para owner foi aceito';
  exception when sqlstate '42501' then null;
  end;
  -- Nunca toca a linha de outro tenant:
  perform 1 from public.company_members
    where company_id = 'c2c2c2c2-0000-4000-8000-000000000002' and role <> 'owner';
  if found then raise exception 'FALHA company_members: papel de outro tenant alterado'; end if;
end $$;

-- audit_logs é imutável para o client: nem sequer há GRANT de UPDATE/DELETE,
-- então o banco nega com 42501 antes mesmo de avaliar RLS.
do $$
begin
  begin
    update public.audit_logs set action = 'adulterado' where true;
    raise exception 'FALHA audit_logs: UPDATE foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;
  begin
    delete from public.audit_logs where true;
    raise exception 'FALHA audit_logs: DELETE foi aceito';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- RPCs: create_company nasce com owner; convite de outro email é recusado.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare c public.companies;
declare n int;
begin
  select * into c from public.create_company('Empresa Nova', 'rls-empresa-nova');
  select count(*) into n from public.company_members
    where company_id = c.id and user_id = 'a1a1a1a1-0000-4000-8000-000000000001'
      and role = 'owner' and deleted_at is null;
  if n <> 1 then raise exception 'FALHA create_company: empresa sem owner'; end if;
end $$;

reset role;

-- my_pending_invites (RPC security definer): só convites do PRÓPRIO email.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- o convite seedado é para convidado@test.local — alice não vê nada
  select count(*) into n from public.my_pending_invites();
  if n <> 0 then raise exception 'FALHA my_pending_invites: viu convite de outro email'; end if;
end $$;

reset role;

-- seed: convite endereçado à alice na empresa do bob
insert into public.company_invites (company_id, email, role, invited_by) values
  ('c2c2c2c2-0000-4000-8000-000000000002', 'rls-alice@test.local', 'member', 'b2b2b2b2-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare v_name text;
begin
  -- agora alice vê 1 convite, com o nome da empresa (via definer) — e nada mais
  select company_name into v_name from public.my_pending_invites();
  if v_name is distinct from 'Bob Co' then
    raise exception 'FALHA my_pending_invites: esperado convite de Bob Co, veio %', v_name;
  end if;
end $$;

reset role;

-- Alice tenta aceitar convite emitido para outro email: deve falhar.
-- (token copiado para uma GUC como superuser, simulando vazamento do link)
select set_config('test.bob_invite_token', token::text, true)
from public.company_invites
where company_id = 'c2c2c2c2-0000-4000-8000-000000000002'
  and email = 'convidado@test.local'; -- há outro convite (da alice) na mesma empresa

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.accept_company_invite(current_setting('test.bob_invite_token')::uuid);
    raise exception 'FALHA accept_company_invite: aceitou convite de outro email';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
    null; -- exceção da RPC é o comportamento esperado
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Termos e consentimentos (LGPD): aceite só em nome próprio, append-only.
-- ---------------------------------------------------------------------------
-- seed: bob aceita a versão vigente (como superuser, para testar visibilidade)
insert into public.terms_acceptances (user_id, terms_version_id)
select 'b2b2b2b2-0000-4000-8000-000000000002', id from public.terms_versions where is_current;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
declare v_version uuid;
begin
  select id into v_version from public.terms_versions where is_current;

  -- termos vigentes são legíveis
  if v_version is null then raise exception 'FALHA terms_versions: versão vigente invisível'; end if;

  -- alice não vê o aceite do bob
  select count(*) into n from public.terms_acceptances;
  if n <> 0 then raise exception 'FALHA terms_acceptances: aceite alheio visível'; end if;

  -- aceite em nome próprio, direto na API: bloqueado (só o servidor grava a evidência)
  begin
    insert into public.terms_acceptances (user_id, terms_version_id)
    values ('a1a1a1a1-0000-4000-8000-000000000001', v_version);
    raise exception 'FALHA terms_acceptances: usuário gravou a própria evidência';
  exception when sqlstate '42501' then null;
  end;

  -- aceite em nome de OUTRO usuário: bloqueado
  begin
    insert into public.terms_acceptances (user_id, terms_version_id)
    values ('b2b2b2b2-0000-4000-8000-000000000002', v_version);
    raise exception 'FALHA terms_acceptances: aceite forjado em nome de outro usuário';
  exception when sqlstate '42501' or unique_violation then
    if sqlerrm like 'FALHA%' then raise; end if;
    null;
  end;

  -- append-only: UPDATE/DELETE sem GRANT (42501)
  begin
    update public.terms_acceptances set accepted_at = now() where true;
    raise exception 'FALHA terms_acceptances: UPDATE foi aceito';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from public.terms_acceptances where true;
    raise exception 'FALHA terms_acceptances: DELETE foi aceito';
  exception when sqlstate '42501' then null;
  end;

  -- terms_versions: client não publica versão
  begin
    insert into public.terms_versions (version, content, is_current)
    values (99, 'hack', false);
    raise exception 'FALHA terms_versions: INSERT de client foi aceito';
  exception when sqlstate '42501' then null;
  end;

  -- user_consents: direto na API, bloqueado em nome próprio e de outro
  begin
    insert into public.user_consents (user_id, consent_type, granted)
    values ('a1a1a1a1-0000-4000-8000-000000000001', 'email_communications', true);
    raise exception 'FALHA user_consents: usuário gravou a própria evidência';
  exception when sqlstate '42501' then null;
  end;
  begin
    insert into public.user_consents (user_id, consent_type, granted)
    values ('b2b2b2b2-0000-4000-8000-000000000002', 'email_communications', true);
    raise exception 'FALHA user_consents: consentimento forjado para outro usuário';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Storage (bucket avatars): cada usuário só escreve na PRÓPRIA pasta.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  -- na própria pasta: permitido
  insert into storage.objects (bucket_id, name)
  values ('avatars', 'a1a1a1a1-0000-4000-8000-000000000001/avatar.png');

  -- na pasta do bob: bloqueado pela policy
  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', 'b2b2b2b2-0000-4000-8000-000000000002/avatar.png');
    raise exception 'FALHA storage: alice escreveu na pasta de outro usuário';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- em bucket sem policy de insert: bloqueado
  begin
    insert into storage.objects (bucket_id, name)
    values ('outro-bucket', 'a1a1a1a1-0000-4000-8000-000000000001/x.png');
    raise exception 'FALHA storage: insert aceito em bucket sem policy';
  exception when sqlstate '42501' or foreign_key_violation then null;
  end;
end $$;

reset role;


-- ---------------------------------------------------------------------------
-- transfer_company_ownership: só o owner, só para membro da própria empresa.
-- ---------------------------------------------------------------------------
select set_config('rls.bob_member_id',
  (select id::text from public.company_members
   where user_id = 'b2b2b2b2-0000-4000-8000-000000000002'), true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  -- empresa do outro tenant: alice não é owner dela
  begin
    perform public.transfer_company_ownership(
      'c2c2c2c2-0000-4000-8000-000000000002',
      current_setting('rls.bob_member_id')::uuid);
    raise exception 'FALHA ownership: alice transferiu a empresa do bob';
  exception when sqlstate '42501' then null;
  end;

  -- membro de outro tenant como alvo: não encontrado na empresa da alice
  begin
    perform public.transfer_company_ownership(
      'c1c1c1c1-0000-4000-8000-000000000001',
      current_setting('rls.bob_member_id')::uuid);
    raise exception 'FALHA ownership: alice promoveu membro de outra empresa';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Privilégio mínimo: a matriz de GRANTs do client é exatamente esta. Tabela nova
-- exposta ao client precisa entrar aqui de propósito.
-- ---------------------------------------------------------------------------
do $$
declare
  diff text;
begin
  with expected (grantee, table_name, privilege_type) as (
    select 'anon', t, p from unnest(array['terms_versions']) t, unnest(array['SELECT']) p
    union all
    select 'authenticated', t, 'SELECT' from unnest(array[
      'roles', 'plans', 'terms_versions', 'platform_admins', 'plan_audit_log', 'profiles', 'companies',
      'clients', 'client_contacts', 'client_locations', 'company_profiles', 'catalog_items', 'catalog_item_costs',
      'quotes', 'quote_items', 'quote_item_costs', 'quote_responses', 'revenues', 'employees', 'employee_payment_details', 'visits', 'visit_employees', 'work_orders', 'work_order_photos',
      'expense_categories', 'expense_templates', 'expenses', 'suppliers', 'time_entries', 'time_entry_dismissals',
      'audit_logs', 'terms_acceptances', 'user_consents', 'company_members',
      'company_invites', 'subscriptions', 'settings', 'reseller_settings', 'resellers',
      'commission_rules', 'reseller_clients', 'reseller_commissions', 'reseller_audit_log', 'reseller_referrals', 'reseller_commission_failures',
      'reseller_me', 'reseller_available_plans', 'reseller_my_clients', 'reseller_my_commissions',
      'reseller_admin_totals', 'reseller_admin_clients', 'reseller_admin_commissions', 'reseller_admin_link_alerts']) t
    union all
    select 'authenticated', t, 'UPDATE' from unnest(array[
      'profiles', 'companies', 'company_members', 'company_invites', 'settings',
      'clients', 'client_contacts', 'client_locations', 'company_profiles', 'catalog_items', 'catalog_item_costs', 'employees', 'employee_payment_details',
      'expense_categories', 'expense_templates', 'expenses', 'suppliers',
      'reseller_settings', 'resellers', 'commission_rules', 'reseller_clients', 'reseller_commissions']) t
    union all
    select 'authenticated', t, 'INSERT' from unnest(array[
      'company_invites', 'settings', 'resellers', 'commission_rules',
      'clients', 'client_contacts', 'client_locations', 'company_profiles', 'catalog_items', 'catalog_item_costs', 'employees', 'employee_payment_details', 'expense_categories', 'expense_templates', 'expenses', 'suppliers']) t
  ),
  actual as (
    select grantee::text, table_name::text, privilege_type::text
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
  ),
  differences as (
    (select 'sobrando: ' || a.grantee || ' ' || a.privilege_type || ' ' || a.table_name as line
     from actual a except select 'sobrando: ' || e.grantee || ' ' || e.privilege_type || ' ' || e.table_name from expected e)
    union all
    (select 'faltando: ' || e.grantee || ' ' || e.privilege_type || ' ' || e.table_name
     from expected e except select 'faltando: ' || a.grantee || ' ' || a.privilege_type || ' ' || a.table_name from actual a)
  )
  select string_agg(line, '; ') into diff from differences;
  if diff is not null then raise exception 'FALHA grants de tabela: %', diff; end if;

  -- anon lê plans só por colunas nomeadas, sem a flag de revenda.
  select string_agg(column_name, ', ' order by column_name) into diff
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'plans' and grantee = 'anon' and privilege_type = 'SELECT';
  if diff is distinct from 'billing_interval, code, created_at, currency, deleted_at, extra_seat_price_cents, features, id, is_active, name, price_cents, updated_at' then
    raise exception 'FALHA grants de coluna: anon em plans: %', diff;
  end if;

  -- anon não executa nenhuma função própria do schema public.
  select string_agg(p.oid::regprocedure::text, ', ') into diff
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and has_function_privilege('anon', p.oid, 'execute')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if diff is not null then raise exception 'FALHA grants de função: anon executa %', diff; end if;

  -- Trigger não é RPC: authenticated não chama diretamente.
  if has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then
    raise exception 'FALHA grants de função: authenticated executa handle_new_user';
  end if;
end $$;

-- Objeto futuro nasce fechado para o client e aberto só ao service_role.
create table public.rls_test_default_acl (id int);
create function public.rls_test_default_fn() returns int language sql as 'select 1';
do $$
begin
  if has_table_privilege('anon', 'public.rls_test_default_acl', 'select')
    or has_table_privilege('authenticated', 'public.rls_test_default_acl', 'select') then
    raise exception 'FALHA default privileges: tabela nova nasce aberta ao client';
  end if;
  if has_table_privilege('service_role', 'public.rls_test_default_acl', 'truncate')
    or not has_table_privilege('service_role', 'public.rls_test_default_acl', 'select') then
    raise exception 'FALHA default privileges: service_role fora do esperado';
  end if;
  if has_function_privilege('anon', 'public.rls_test_default_fn()', 'execute')
    or has_function_privilege('authenticated', 'public.rls_test_default_fn()', 'execute') then
    raise exception 'FALHA default privileges: função nova nasce aberta ao client';
  end if;
end $$;
drop function public.rls_test_default_fn();
drop table public.rls_test_default_acl;

-- Reassinatura: o índice único barra a segunda assinatura até a anterior ir para o
-- histórico, que é o que billingService.applyPaymentEvent faz.
do $$
declare v_plan uuid;
begin
  select id into v_plan from public.plans where code = 'pro';
  begin
    insert into public.subscriptions (company_id, plan_id) values ('c2c2c2c2-0000-4000-8000-000000000002', v_plan);
    raise exception 'FALHA subscriptions: duas assinaturas ativas na mesma empresa';
  exception when unique_violation then null; -- esperado
  end;
  update public.subscriptions set deleted_at = now() where company_id = 'c2c2c2c2-0000-4000-8000-000000000002';
  insert into public.subscriptions (company_id, plan_id, status) values ('c2c2c2c2-0000-4000-8000-000000000002', v_plan, 'active');
end $$;

-- ---------------------------------------------------------------------------
-- platform_admins: ninguém se promove; cada um só enxerga a própria linha.
-- ---------------------------------------------------------------------------
insert into public.platform_admins (user_id) values ('b2b2b2b2-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  if public.is_super_admin() then raise exception 'FALHA platform_admins: alice virou super admin'; end if;

  select count(*) into n from public.platform_admins;
  if n <> 0 then raise exception 'FALHA platform_admins: alice viu a linha de outro usuário'; end if;

  begin
    insert into public.platform_admins (user_id) values ('a1a1a1a1-0000-4000-8000-000000000001');
    raise exception 'FALHA platform_admins: auto-promoção foi aceita';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
begin
  if not public.is_super_admin() then raise exception 'FALHA platform_admins: bob não é super admin'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Clientes: outra empresa e técnico não leem; member não apaga.
-- ---------------------------------------------------------------------------
reset role;
-- Os blocos seguintes testam papéis, não plano: a empresa precisa de vagas e recursos pagos.
insert into public.subscriptions (company_id, plan_id, status)
select 'c1c1c1c1-0000-4000-8000-000000000001', id, 'active' from public.plans where code = 'enterprise';
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('d3d3d3d3-0000-4000-8000-000000000003', 'rls-member@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Member RLS"}'),
  ('e4e4e4e4-0000-4000-8000-000000000004', 'rls-tecnico@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Técnico RLS"}');
insert into public.company_members (company_id, user_id, role) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'd3d3d3d3-0000-4000-8000-000000000003', 'member'),
  ('c1c1c1c1-0000-4000-8000-000000000001', 'e4e4e4e4-0000-4000-8000-000000000004', 'technician');
insert into public.clients (id, company_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Cliente Alice'),
  ('f2f2f2f2-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 'Cliente Bob');
insert into public.client_contacts (company_id, client_id, name, is_primary) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Contato A', true);
insert into public.client_locations (company_id, client_id, name, address) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Sede', 'Rua A, 10');

-- Contato novo principal desmarca o anterior; FK composta barra cliente de outra empresa.
do $$
declare n int;
begin
  insert into public.client_contacts (company_id, client_id, name, is_primary) values
    ('c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Contato B', true);
  select count(*) into n from public.client_contacts
  where client_id = 'f1f1f1f1-0000-4000-8000-000000000001' and is_primary and deleted_at is null;
  if n <> 1 then raise exception 'FALHA clientes: % contatos principais', n; end if;

  begin
    insert into public.client_contacts (company_id, client_id, name) values
      ('c1c1c1c1-0000-4000-8000-000000000001', 'f2f2f2f2-0000-4000-8000-000000000002', 'Cruzado');
    raise exception 'FALHA clientes: contato apontou para cliente de outra empresa';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Alice (owner da empresa 1).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.clients;
  if n <> 1 then raise exception 'FALHA clientes: owner deveria ver só o próprio, viu %', n; end if;
  select count(*) into n from public.clients where id = 'f2f2f2f2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA clientes: leu cliente de outra empresa'; end if;

  update public.clients set name = 'Invadido' where id = 'f2f2f2f2-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA clientes: alterou cliente de outra empresa'; end if;

  begin
    insert into public.clients (company_id, name) values ('c2c2c2c2-0000-4000-8000-000000000002', 'Plantado');
    raise exception 'FALHA clientes: criou cliente em outra empresa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Member: lê e edita, mas não apaga.
select set_config('request.jwt.claims',
  '{"sub":"d3d3d3d3-0000-4000-8000-000000000003","email":"rls-member@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.clients;
  if n <> 1 then raise exception 'FALHA clientes: member deveria ler 1, leu %', n; end if;
  update public.clients set notes = 'ok' where id = 'f1f1f1f1-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA clientes: member não editou'; end if;

  begin
    update public.clients set deleted_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000001';
    raise exception 'FALHA clientes: member apagou cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Técnico: não lê nem escreve nos cadastros.
select set_config('request.jwt.claims',
  '{"sub":"e4e4e4e4-0000-4000-8000-000000000004","email":"rls-tecnico@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.clients;
  if n <> 0 then raise exception 'FALHA clientes: técnico leu clientes'; end if;
  select count(*) into n from public.client_contacts;
  if n <> 0 then raise exception 'FALHA clientes: técnico leu contatos'; end if;
  select count(*) into n from public.client_locations;
  if n <> 0 then raise exception 'FALHA clientes: técnico leu locais'; end if;

  begin
    insert into public.clients (company_id, name) values ('c1c1c1c1-0000-4000-8000-000000000001', 'Do técnico');
    raise exception 'FALHA clientes: técnico criou cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Owner apaga; o registro some das leituras.
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.clients set deleted_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA clientes: owner não apagou'; end if;
  select count(*) into n from public.clients where deleted_at is null;
  if n <> 0 then raise exception 'FALHA clientes: registro apagado continuou ativo'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Catálogo e orçamentos: custo só para owner/admin; escrita só pelas funções.
-- Alice = owner, d3 = member, e4 = técnico, todos da empresa 1. Bob = outra empresa.
-- ---------------------------------------------------------------------------
reset role;
-- O cliente anterior foi apagado pelo teste; este continua ativo.
insert into public.clients (id, company_id, name) values
  ('f3f3f3f3-0000-4000-8000-000000000003', 'c1c1c1c1-0000-4000-8000-000000000001', 'Cliente Orçamento');
insert into public.client_locations (id, company_id, client_id, name, address) values
  ('f4f4f4f4-0000-4000-8000-000000000004', 'c1c1c1c1-0000-4000-8000-000000000001', 'f3f3f3f3-0000-4000-8000-000000000003', 'Sede', 'Rua A, 10');
insert into public.catalog_items (id, company_id, kind, name, unit, price_cents) values
  ('f5f5f5f5-0000-4000-8000-000000000005', 'c1c1c1c1-0000-4000-8000-000000000001', 'product', 'Disjuntor', 'un', 1000),
  ('f6f6f6f6-0000-4000-8000-000000000006', 'c2c2c2c2-0000-4000-8000-000000000002', 'product', 'Do Bob', 'un', 1000);
insert into public.catalog_item_costs (company_id, catalog_item_id, cost_cents) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'f5f5f5f5-0000-4000-8000-000000000005', 400);

-- Member: vê catálogo sem custo, cria e envia, não fecha nem exclui nem escreve direto.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d3d3d3d3-0000-4000-8000-000000000003","email":"rls-member@test.local","role":"authenticated"}', true);
do $$
declare n int; v_id uuid; v_id2 uuid; v_total int; v_number int; v_number2 int;
begin
  select count(*) into n from public.catalog_items;
  if n <> 1 then raise exception 'FALHA catálogo: member deveria ver 1 item, viu %', n; end if;
  select count(*) into n from public.catalog_item_costs;
  if n <> 0 then raise exception 'FALHA catálogo: member leu custo'; end if;
  begin
    update public.catalog_items set price_cents = 1 where id = 'f5f5f5f5-0000-4000-8000-000000000005';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALHA catálogo: member editou preço'; end if;
  end;

  v_id := public.save_quote(
    'c1c1c1c1-0000-4000-8000-000000000001', null, 'f3f3f3f3-0000-4000-8000-000000000003',
    'f4f4f4f4-0000-4000-8000-000000000004', 'Serviço', current_date + 10, 500, 'Condições',
    '[{"catalog_item_id":"f5f5f5f5-0000-4000-8000-000000000005","description":"Disjuntor","unit":"un","pricing_mode":"fixed","quantity":2,"people":9,"unit_price_cents":1000},
      {"description":"Mão de obra","unit":"h","pricing_mode":"hourly","quantity":1.5,"people":2,"unit_price_cents":1001}]');
  -- 2×1000 + round(1,5×2×1001) = 2000 + 3003; menos 500.
  select total_cents, number into v_total, v_number from public.quotes where id = v_id;
  if v_total <> 4503 then raise exception 'FALHA orçamento: total %, esperado 4503', v_total; end if;

  v_id2 := public.save_quote('c1c1c1c1-0000-4000-8000-000000000001', null, null, null, '', null, 99999, '', '[]');
  select total_cents, number into v_total, v_number2 from public.quotes where id = v_id2;
  if v_total <> 0 then raise exception 'FALHA orçamento: total negativo'; end if;
  if v_number2 <> v_number + 1 then raise exception 'FALHA orçamento: número não sequencial'; end if;

  -- Rascunho sem cliente ou sem itens não é enviado.
  begin
    perform public.transition_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id2, 'send');
    raise exception 'FALHA orçamento: enviou sem cliente';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Transição inválida é recusada.
  begin
    perform public.transition_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 'approve');
    raise exception 'FALHA orçamento: aprovou rascunho';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  perform public.transition_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 'send');

  -- Enviado não é editável.
  begin
    perform public.save_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 'f3f3f3f3-0000-4000-8000-000000000003', null, 'x', null, 0, '', '[]');
    raise exception 'FALHA orçamento: editou enviado';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  perform public.transition_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 'approve');

  begin
    perform public.close_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 100, current_date);
    raise exception 'FALHA orçamento: member fechou';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id2);
    raise exception 'FALHA orçamento: member excluiu';
  exception when insufficient_privilege then null;
  end;

  -- Escrita direta nas tabelas é negada, mesmo para quem tem acesso.
  begin
    update public.quotes set total_cents = 1 where id = v_id;
    raise exception 'FALHA orçamento: alterou quotes direto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.revenues (company_id, quote_id, amount_cents, competence_date)
    values ('c1c1c1c1-0000-4000-8000-000000000001', v_id, 1, current_date);
    raise exception 'FALHA orçamento: criou receita direto';
  exception when insufficient_privilege then null;
  end;

  -- Member não chega às funções do link público nem do job.
  begin
    perform public.get_public_quote('x');
    raise exception 'FALHA orçamento: member chamou get_public_quote';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.expire_due_quotes();
    raise exception 'FALHA orçamento: member chamou expire_due_quotes';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Owner: vê custo, fecha, a receita aparece; desfazer volta para aprovado. Só ele vê a receita.
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare n int; v_id uuid; v_status text;
begin
  select count(*) into n from public.catalog_item_costs;
  if n <> 1 then raise exception 'FALHA catálogo: owner não leu custo'; end if;

  select id into v_id from public.quotes where status = 'approved' limit 1;
  perform public.close_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 4503, current_date);
  select count(*) into n from public.revenues where quote_id = v_id;
  if n <> 1 then raise exception 'FALHA orçamento: fechar não criou receita'; end if;

  perform public.undo_close_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id);
  select status into v_status from public.quotes where id = v_id;
  if v_status <> 'approved' then raise exception 'FALHA orçamento: desfazer não voltou a aprovado'; end if;
  select count(*) into n from public.revenues where quote_id = v_id;
  if n <> 0 then raise exception 'FALHA orçamento: receita continuou após desfazer'; end if;

  begin
    perform public.delete_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id);
    raise exception 'FALHA orçamento: excluiu aprovado';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  perform public.close_quote('c1c1c1c1-0000-4000-8000-000000000001', v_id, 4503, current_date);
end $$;

-- Member não lê receita; técnico não lê nada; outra empresa não lê nem age.
select set_config('request.jwt.claims',
  '{"sub":"d3d3d3d3-0000-4000-8000-000000000003","email":"rls-member@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.revenues;
  if n <> 0 then raise exception 'FALHA orçamento: member leu receita'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"e4e4e4e4-0000-4000-8000-000000000004","email":"rls-tecnico@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.quotes;
  if n <> 0 then raise exception 'FALHA orçamento: técnico leu orçamentos'; end if;
  select count(*) into n from public.catalog_items;
  if n <> 0 then raise exception 'FALHA catálogo: técnico leu catálogo'; end if;
  begin
    perform public.save_quote('c1c1c1c1-0000-4000-8000-000000000001', null, null, null, '', null, 0, '', '[]');
    raise exception 'FALHA orçamento: técnico criou';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
declare n int; v_alien uuid;
begin
  select count(*) into n from public.quotes where company_id = 'c1c1c1c1-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALHA orçamento: outra empresa leu'; end if;
  select count(*) into n from public.catalog_items where company_id = 'c1c1c1c1-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALHA catálogo: outra empresa leu'; end if;
  begin
    perform public.save_quote('c1c1c1c1-0000-4000-8000-000000000001', null, null, null, '', null, 0, '', '[]');
    raise exception 'FALHA orçamento: outra empresa criou';
  exception when insufficient_privilege then null;
  end;
  -- Na própria empresa, não aponta para cliente alheio nem item de catálogo alheio.
  begin
    perform public.save_quote('c2c2c2c2-0000-4000-8000-000000000002', null, 'f3f3f3f3-0000-4000-8000-000000000003', null, '', null, 0, '', '[]');
    raise exception 'FALHA orçamento: usou cliente de outra empresa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_quote('c2c2c2c2-0000-4000-8000-000000000002', null, null, null, '', null, 0, '',
      '[{"catalog_item_id":"f5f5f5f5-0000-4000-8000-000000000005","description":"x","unit":"un","pricing_mode":"fixed","quantity":1,"unit_price_cents":1}]');
    raise exception 'FALHA orçamento: usou catálogo de outra empresa';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Link público (service_role): token é a credencial, rascunho não abre, a resposta só vale uma
-- vez e dentro da validade; o job expira os vencidos.
reset role;
do $$
declare v_token text; v_quote uuid; v_doc jsonb; v_status text; n int;
begin
  select id into v_quote from public.quotes
  where status = 'draft' and company_id = 'c1c1c1c1-0000-4000-8000-000000000001' limit 1;
  select public_token into v_token from public.quotes where id = v_quote;
  if public.get_public_quote(v_token) is not null then
    raise exception 'FALHA link: rascunho abriu pelo link';
  end if;

  update public.quotes
  set status = 'sent', client_id = 'f3f3f3f3-0000-4000-8000-000000000003', valid_until = current_date + 5
  where id = v_quote;
  v_doc := public.get_public_quote(v_token);
  if v_doc is null then raise exception 'FALHA link: enviado não abriu'; end if;
  if v_doc::text like '%cost%' then raise exception 'FALHA link: documento expõe custo'; end if;

  begin
    perform public.respond_public_quote(v_token, 'refused', 'Ana', '');
    raise exception 'FALHA link: recusou sem motivo';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  perform public.respond_public_quote(v_token, 'approved', 'Ana', '');
  select status into v_status from public.quotes where id = v_quote;
  if v_status <> 'approved' then raise exception 'FALHA link: não aprovou'; end if;
  select count(*) into n from public.quote_responses where quote_id = v_quote;
  if n <> 1 then raise exception 'FALHA link: resposta não registrada'; end if;

  begin
    perform public.respond_public_quote(v_token, 'approved', 'Ana', '');
    raise exception 'FALHA link: aceitou segunda resposta';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  update public.quotes set status = 'sent', valid_until = current_date - 2 where id = v_quote;
  begin
    perform public.respond_public_quote(v_token, 'approved', 'Ana', '');
    raise exception 'FALHA link: aceitou resposta vencida';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  if public.expire_due_quotes() < 1 then raise exception 'FALHA job: não expirou vencido'; end if;
  select status into v_status from public.quotes where id = v_quote;
  if v_status <> 'expired' then raise exception 'FALHA job: status %', v_status; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Equipe e agenda: pagamento só para owner/admin; técnico vê só as próprias visitas; a mesma
-- pessoa não fica em duas visitas ativas no mesmo horário.
-- ---------------------------------------------------------------------------
reset role;
insert into public.employees (id, company_id, name, active, user_id) values
  ('a0a0a0a0-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Técnico Vinculado', true, 'e4e4e4e4-0000-4000-8000-000000000004'),
  ('a0a0a0a0-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 'Outra Pessoa', true, null),
  ('a0a0a0a0-0000-4000-8000-000000000003', 'c1c1c1c1-0000-4000-8000-000000000001', 'Inativa', false, null),
  ('a0a0a0a0-0000-4000-8000-000000000004', 'c2c2c2c2-0000-4000-8000-000000000002', 'Do Bob', true, null);
insert into public.employee_payment_details (company_id, employee_id, hourly_pay_cents) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 5000);

do $$
begin
  begin
    insert into public.employees (company_id, name, user_id) values
      ('c1c1c1c1-0000-4000-8000-000000000001', 'Forasteiro', 'b2b2b2b2-0000-4000-8000-000000000002');
    raise exception 'FALHA equipe: vinculou usuário de outra empresa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

-- Member: lê equipe sem pagamento, não edita, agenda sim.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d3d3d3d3-0000-4000-8000-000000000003","email":"rls-member@test.local","role":"authenticated"}', true);
do $$
declare n int; v_a uuid; v_b uuid; v_c uuid;
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
  cli uuid := 'f3f3f3f3-0000-4000-8000-000000000003';
  loc uuid := 'f4f4f4f4-0000-4000-8000-000000000004';
  tec uuid := 'a0a0a0a0-0000-4000-8000-000000000001';
  outra uuid := 'a0a0a0a0-0000-4000-8000-000000000002';
  inativa uuid := 'a0a0a0a0-0000-4000-8000-000000000003';
begin
  select count(*) into n from public.employees;
  if n <> 3 then raise exception 'FALHA equipe: member deveria ver 3, viu %', n; end if;
  select count(*) into n from public.employee_payment_details;
  if n <> 0 then raise exception 'FALHA equipe: member leu pagamento'; end if;
  update public.employees set name = 'Hackeado' where id = tec;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA equipe: member editou'; end if;

  v_a := public.save_visit(co, null, cli, loc, null, 'execution', '2031-05-10', '08:00', '12:00', 'scheduled', '', array[tec]);

  -- Sobreposição recusada; encostar não conflita.
  begin
    perform public.save_visit(co, null, cli, loc, null, 'execution', '2031-05-10', '11:00', '13:00', 'scheduled', '', array[outra, tec]);
    raise exception 'FALHA agenda: aceitou sobreposição';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  v_b := public.save_visit(co, null, cli, loc, null, 'assessment', '2031-05-10', '12:00', '13:00', 'scheduled', '', array[tec]);

  -- Mover para cima de outra visita também é recusado.
  begin
    perform public.save_visit(co, v_b, cli, loc, null, 'assessment', '2031-05-10', '11:30', '13:00', 'scheduled', '', array[tec]);
    raise exception 'FALHA agenda: mover criou sobreposição';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Cancelada não bloqueia; visita sem conflito reativa, com conflito não.
  perform public.save_visit(co, v_a, cli, loc, null, 'execution', '2031-05-10', '08:00', '12:00', 'canceled', '', array[tec]);
  v_c := public.save_visit(co, null, cli, loc, null, 'execution', '2031-05-10', '09:00', '10:00', 'scheduled', '', array[tec]);
  begin
    perform public.save_visit(co, v_a, cli, loc, null, 'execution', '2031-05-10', '08:00', '12:00', 'scheduled', '', array[tec]);
    raise exception 'FALHA agenda: reativou sobre outra visita';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Regras de preenchimento.
  begin
    perform public.save_visit(co, null, cli, loc, null, 'execution', '2031-06-10', '08:00', '12:00', 'scheduled', '', array[]::uuid[]);
    raise exception 'FALHA agenda: aceitou sem equipe';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_visit(co, null, cli, loc, null, 'execution', '2031-06-10', '08:00', '12:00', 'scheduled', '', array[inativa]);
    raise exception 'FALHA agenda: aceitou pessoa inativa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_visit(co, null, cli, loc, null, 'execution', '2031-06-10', '12:00', '08:00', 'scheduled', '', array[tec]);
    raise exception 'FALHA agenda: aceitou fim antes do início';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_visit(co, null, cli, loc, null, 'execution', '2031-06-10', '08:00', '12:00', 'scheduled', '', array['a0a0a0a0-0000-4000-8000-000000000004'::uuid]);
    raise exception 'FALHA agenda: escalou pessoa de outra empresa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Visita só de outra pessoa, para provar o filtro do técnico.
  perform public.save_visit(co, null, cli, loc, null, 'execution', '2031-07-01', '08:00', '09:00', 'scheduled', '', array[outra]);

  begin
    perform public.delete_visit(co, v_b);
    raise exception 'FALHA agenda: member excluiu visita';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.visits set notes = 'x' where id = v_b;
    raise exception 'FALHA agenda: alterou visits direto';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Técnico: só as próprias visitas, sem editar, sem equipe nem pagamento.
select set_config('request.jwt.claims',
  '{"sub":"e4e4e4e4-0000-4000-8000-000000000004","email":"rls-tecnico@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.visits where visit_date = '2031-07-01';
  if n <> 0 then raise exception 'FALHA agenda: técnico viu visita de outra pessoa'; end if;
  select count(*) into n from public.visits where visit_date = '2031-05-10';
  if n = 0 then raise exception 'FALHA agenda: técnico não viu a própria visita'; end if;
  select count(*) into n from public.employees;
  if n <> 0 then raise exception 'FALHA equipe: técnico leu equipe'; end if;
  select count(*) into n from public.employee_payment_details;
  if n <> 0 then raise exception 'FALHA equipe: técnico leu pagamento'; end if;
  begin
    perform public.save_visit('c1c1c1c1-0000-4000-8000-000000000001', null, 'f3f3f3f3-0000-4000-8000-000000000003', 'f4f4f4f4-0000-4000-8000-000000000004', null, 'execution', '2031-08-01', '08:00', '09:00', 'scheduled', '', array['a0a0a0a0-0000-4000-8000-000000000001'::uuid]);
    raise exception 'FALHA agenda: técnico criou visita';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Outra empresa não lê nem age. Owner vê pagamento e exclui, e a exclusão libera o horário.
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.visits where company_id = 'c1c1c1c1-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALHA agenda: outra empresa leu'; end if;
  select count(*) into n from public.employees where company_id = 'c1c1c1c1-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALHA equipe: outra empresa leu'; end if;
  begin
    perform public.save_visit('c2c2c2c2-0000-4000-8000-000000000002', null, 'f3f3f3f3-0000-4000-8000-000000000003', 'f4f4f4f4-0000-4000-8000-000000000004', null, 'execution', '2031-08-01', '08:00', '09:00', 'scheduled', '', array['a0a0a0a0-0000-4000-8000-000000000004'::uuid]);
    raise exception 'FALHA agenda: usou cliente de outra empresa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare n int; v_id uuid;
begin
  select count(*) into n from public.employee_payment_details;
  if n <> 1 then raise exception 'FALHA equipe: owner não leu pagamento'; end if;
  select id into v_id from public.visits where visit_date = '2031-05-10' and starts_at = '09:00';
  perform public.delete_visit('c1c1c1c1-0000-4000-8000-000000000001', v_id);
  perform public.save_visit('c1c1c1c1-0000-4000-8000-000000000001', null, 'f3f3f3f3-0000-4000-8000-000000000003', 'f4f4f4f4-0000-4000-8000-000000000004', null, 'execution', '2031-05-10', '09:00', '10:00', 'scheduled', '', array['a0a0a0a0-0000-4000-8000-000000000001'::uuid]);
end $$;

-- A restrição do banco segura mesmo quem escreve direto, como numa corrida entre dois usuários.
reset role;
do $$
begin
  insert into public.visit_employees (company_id, visit_id, employee_id, time_range)
  select v.company_id, v.id, 'a0a0a0a0-0000-4000-8000-000000000001', tsrange('2031-05-10 09:30', '2031-05-10 09:45', '[)')
  from public.visits v where v.visit_date = '2031-07-01';
  raise exception 'FALHA agenda: restrição EXCLUDE não barrou';
exception when exclusion_violation then null;
end $$;

-- ---------------------------------------------------------------------------
-- Ordem de serviço: só quem está escalado preenche; o escritório só lê; concluída não muda;
-- o técnico recebe da visita só o necessário; arquivos seguem a empresa e a visita.
-- A visita de 2031-05-10 às 12:00 é do técnico; a de 2031-07-01 é da outra pessoa.
-- ---------------------------------------------------------------------------
reset role;
insert into public.client_contacts (company_id, client_id, name, phone, is_primary) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'f3f3f3f3-0000-4000-8000-000000000003', 'Contato Campo', '14999990000', true);
update public.clients set document = '11222333000181', notes = 'SEGREDO-COMERCIAL' where id = 'f3f3f3f3-0000-4000-8000-000000000003';
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('a5a5a5a5-0000-4000-8000-000000000005', 'rls-tecnico2@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Técnico Dois"}');
insert into public.company_members (company_id, user_id, role) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-000000000005', 'technician');

select set_config('request.jwt.claims',
  '{"sub":"e4e4e4e4-0000-4000-8000-000000000004","email":"rls-tecnico@test.local","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
  mine uuid; other uuid; v_order uuid; v_sheet jsonb; v_status text; n int; v_path text;
begin
  select id into mine from public.visits where visit_date = '2031-05-10' and starts_at = '12:00';
  -- A visita da outra pessoa não é visível ao técnico: as funções recusam mesmo com o id correto.
  perform set_config('app.mine', mine::text, true);

  v_sheet := public.get_visit_sheet(co, mine);
  if v_sheet is null then raise exception 'FALHA OS: técnico não abriu a própria visita'; end if;
  if v_sheet::text like '%SEGREDO-COMERCIAL%' or v_sheet::text like '%11222333000181%' then
    raise exception 'FALHA OS: técnico recebeu documento ou observações do cliente';
  end if;
  if v_sheet -> 'contact' ->> 'phone' <> '14999990000' then raise exception 'FALHA OS: faltou o contato'; end if;

  select count(*) into n from jsonb_array_elements(public.list_my_visits(co, '2031-01-01', '2031-12-31')) x
  where x ->> 'visit_date' = '2031-07-01';
  if n <> 0 then raise exception 'FALHA OS: lista trouxe visita de outra pessoa'; end if;

  begin
    perform public.save_work_order(co, mine, '{}', 'x', null);
    raise exception 'FALHA OS: salvou sem iniciar';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  v_order := public.start_work_order(co, mine);
  perform set_config('app.order', v_order::text, true);
  select status into v_status from public.visits where id = mine;
  if v_status <> 'in_progress' then raise exception 'FALHA OS: cheguei não pôs em andamento'; end if;
  if public.start_work_order(co, mine) <> v_order then raise exception 'FALHA OS: cheguei duplicou a OS'; end if;
  select jsonb_array_length(checklist) into n from public.work_orders where id = v_order;
  if n <> 4 then raise exception 'FALHA OS: checklist de visita técnica com % itens', n; end if;

  perform public.save_work_order(co, mine, array['1', '3'], 'Tudo certo', '08:00');
  select count(*) into n from public.work_orders w, jsonb_array_elements(w.checklist) i
  where w.id = v_order and (i ->> 'done')::boolean;
  if n <> 2 then raise exception 'FALHA OS: checklist não salvou'; end if;

  -- Caminho de foto fora da pasta da OS é recusado.
  begin
    perform public.add_work_order_photo(co, mine, 'outra-empresa/x/a.jpg', '');
    raise exception 'FALHA OS: aceitou arquivo de outra pasta';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  perform public.add_work_order_photo(co, mine, co || '/' || v_order || '/a.jpg', 'Antes');

  -- Política dos arquivos.
  if not public.can_write_work_order_file(co || '/' || v_order || '/b.jpg') then
    raise exception 'FALHA arquivos: técnico não grava na própria OS';
  end if;
  if public.can_write_work_order_file('c2c2c2c2-0000-4000-8000-000000000002/' || v_order || '/b.jpg') then
    raise exception 'FALHA arquivos: gravou em pasta de outra empresa';
  end if;

  -- Concluir exige assinatura, nome e fim depois do início.
  begin
    perform public.complete_work_order(co, mine, null, 'Ana', '17:00');
    raise exception 'FALHA OS: concluiu sem assinatura';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.complete_work_order(co, mine, co || '/' || v_order || '/s.png', ' ', '17:00');
    raise exception 'FALHA OS: concluiu sem nome';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.complete_work_order(co, mine, co || '/' || v_order || '/s.png', 'Ana', '07:00');
    raise exception 'FALHA OS: aceitou fim antes do início';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  begin
    update public.work_orders set report = 'x' where id = v_order;
    raise exception 'FALHA OS: alterou work_orders direto';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Outro técnico da empresa, member e outra empresa não preenchem. Member lê.
select set_config('request.jwt.claims',
  '{"sub":"a5a5a5a5-0000-4000-8000-000000000005","email":"rls-tecnico2@test.local","role":"authenticated"}', true);
do $$
declare mine uuid := current_setting('app.mine')::uuid; n int;
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  if public.get_visit_sheet(co, mine) is not null then raise exception 'FALHA OS: outro técnico abriu a visita'; end if;
  select count(*) into n from public.work_orders;
  if n <> 0 then raise exception 'FALHA OS: outro técnico leu OS'; end if;
  select count(*) into n from public.work_order_photos;
  if n <> 0 then raise exception 'FALHA OS: outro técnico leu fotos'; end if;
  begin
    perform public.save_work_order(co, mine, '{}', 'x', null);
    raise exception 'FALHA OS: outro técnico salvou';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  if public.can_read_work_order_file(co || '/' || current_setting('app.order') || '/a.jpg') then
    raise exception 'FALHA arquivos: outro técnico lê foto';
  end if;
  if public.can_write_work_order_file(co || '/' || current_setting('app.order') || '/b.jpg') then
    raise exception 'FALHA arquivos: outro técnico grava foto';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"d3d3d3d3-0000-4000-8000-000000000003","email":"rls-member@test.local","role":"authenticated"}', true);
do $$
declare mine uuid := current_setting('app.mine')::uuid; n int; v_order uuid;
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  if public.get_visit_sheet(co, mine) is null then raise exception 'FALHA OS: member não leu a visita'; end if;
  select id into v_order from public.work_orders where visit_id = mine;
  if v_order is null then raise exception 'FALHA OS: member não leu a OS'; end if;
  if not public.can_read_work_order_file(co || '/' || v_order || '/a.jpg') then
    raise exception 'FALHA arquivos: member não lê foto';
  end if;
  if public.can_write_work_order_file(co || '/' || v_order || '/b.jpg') then
    raise exception 'FALHA arquivos: member grava na OS de outra pessoa';
  end if;
  begin
    perform public.save_work_order(co, mine, '{}', 'x', null);
    raise exception 'FALHA OS: member preencheu OS de outra pessoa';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
declare mine uuid := current_setting('app.mine')::uuid; n int; v_order uuid;
begin
  if public.get_visit_sheet('c1c1c1c1-0000-4000-8000-000000000001', mine) is not null then
    raise exception 'FALHA OS: outra empresa abriu a visita';
  end if;
  if public.get_visit_sheet('c2c2c2c2-0000-4000-8000-000000000002', mine) is not null then
    raise exception 'FALHA OS: visita abriu pela empresa errada';
  end if;
  select count(*) into n from public.work_orders;
  if n <> 0 then raise exception 'FALHA OS: outra empresa leu OS'; end if;
  if public.can_read_work_order_file('c1c1c1c1-0000-4000-8000-000000000001/' || current_setting('app.order') || '/a.jpg') then
    raise exception 'FALHA arquivos: outra empresa lê foto';
  end if;
end $$;

-- Concluir fecha tudo.
select set_config('request.jwt.claims',
  '{"sub":"e4e4e4e4-0000-4000-8000-000000000004","email":"rls-tecnico@test.local","role":"authenticated"}', true);
do $$
declare mine uuid := current_setting('app.mine')::uuid; v_order uuid; v_status text;
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  select id into v_order from public.work_orders where visit_id = mine;
  perform public.complete_work_order(co, mine, co || '/' || v_order || '/s.png', 'Ana Cliente', '17:00');
  select status into v_status from public.visits where id = mine;
  if v_status <> 'completed' then raise exception 'FALHA OS: visita não concluiu'; end if;
  begin
    perform public.save_work_order(co, mine, '{}', 'mudei', null);
    raise exception 'FALHA OS: alterou OS concluída';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.add_work_order_photo(co, mine, co || '/' || v_order || '/z.jpg', '');
    raise exception 'FALHA OS: foto em OS concluída';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  if public.can_write_work_order_file(co || '/' || v_order || '/z.jpg') then
    raise exception 'FALHA arquivos: gravação em OS concluída';
  end if;
end $$;

-- Visita assinada não volta atrás nem é excluída.
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare mine uuid := current_setting('app.mine')::uuid;
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  begin
    perform public.delete_visit(co, mine);
    raise exception 'FALHA OS: excluiu visita assinada';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_visit(co, mine, 'f3f3f3f3-0000-4000-8000-000000000003', 'f4f4f4f4-0000-4000-8000-000000000004', null, 'assessment', '2031-05-10', '12:00', '13:00', 'scheduled', '', array['a0a0a0a0-0000-4000-8000-000000000001'::uuid]);
    raise exception 'FALHA OS: reabriu visita assinada';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Gastos e horas: só owner e admin; job idempotente; fechamento e reabertura; sobreposição.
-- A visita assinada do técnico (2031-05-10) já gerou apontamento pendente, das 08:00 às 17:00.
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
  outra uuid := 'a0a0a0a0-0000-4000-8000-000000000002';
  n int; v_cat uuid; v_tpl uuid; v_visit uuid;
begin
  select count(*) into n from public.expense_categories where company_id = co;
  if n <> 8 then raise exception 'FALHA gastos: empresa com % categorias padrão', n; end if;

  select count(*) into n from public.time_entries te
  join public.visits v on v.id = te.visit_id
  where v.visit_date = '2031-05-10' and te.status = 'pending' and te.break_minutes = 60;
  if n <> 1 then raise exception 'FALHA horas: OS concluída não gerou 1 apontamento pendente com intervalo, gerou %', n; end if;

  select id into v_cat from public.expense_categories where company_id = co and name = 'Aluguel';

  -- company_today, não current_date: o mês vale no fuso da empresa, e o UTC vira antes.
  -- Modelo vigente, modelo que começa no futuro, modelo encerrado e modelo inativo.
  insert into public.expense_templates (id, company_id, description, category_id, amount_cents, day_of_month, starts_on)
  values ('b0b0b0b0-0000-4000-8000-000000000001', co, 'Aluguel do galpão', v_cat, 100000, 5, date_trunc('month', public.company_today(co)) - interval '2 months');
  insert into public.expense_templates (company_id, description, category_id, amount_cents, day_of_month, starts_on)
  values (co, 'Começa depois', v_cat, 100, 5, public.company_today(co) + interval '3 months');
  insert into public.expense_templates (company_id, description, category_id, amount_cents, day_of_month, starts_on, ends_on)
  values (co, 'Encerrado', v_cat, 100, 5, '2020-01-01', '2020-06-30');
  insert into public.expense_templates (company_id, description, category_id, amount_cents, day_of_month, starts_on, active)
  values (co, 'Inativo', v_cat, 100, 5, '2020-01-01', false);
  insert into public.expense_templates (company_id, description, category_id, amount_cents, day_of_month, starts_on, employee_id)
  values (co, 'Salário', v_cat, 100, 5, '2020-01-01', outra);

  if public.generate_month_expenses(co, public.company_today(co)) <> 2 then
    raise exception 'FALHA gastos: mês atual deveria gerar 2 lançamentos';
  end if;
  if public.generate_month_expenses(co, public.company_today(co)) <> 0 then
    raise exception 'FALHA gastos: repetir o job duplicou';
  end if;
  if public.generate_due_expenses() < 0 then raise exception 'FALHA gastos: job'; end if;
  select count(*) into n from public.expenses where company_id = co and description = 'Salário' and kind = 'payroll';
  if n <> 1 then raise exception 'FALHA gastos: modelo com funcionário não gerou folha'; end if;
  if public.generate_month_expenses(co, (public.company_today(co) + interval '1 month')::date) <> 0 then
    raise exception 'FALHA gastos: gerou mês futuro';
  end if;

  -- Excluir o lançamento de um mês não o faz voltar; excluir o modelo mantém o que já foi gerado.
  update public.expenses set deleted_at = now() where template_id = 'b0b0b0b0-0000-4000-8000-000000000001';
  if public.generate_month_expenses(co, public.company_today(co)) <> 0 then
    raise exception 'FALHA gastos: lançamento excluído voltou';
  end if;
  update public.expenses set deleted_at = null where template_id = 'b0b0b0b0-0000-4000-8000-000000000001';
  update public.expense_templates set deleted_at = now() where id = 'b0b0b0b0-0000-4000-8000-000000000001';
  select count(*) into n from public.expenses where template_id = 'b0b0b0b0-0000-4000-8000-000000000001' and deleted_at is null;
  if n <> 1 then raise exception 'FALHA gastos: excluir modelo apagou lançamento'; end if;

  -- Prestador com hora a pagar e visita passada que vira sugestão.
  update public.employee_payment_details set contract_type = 'clt'
  where employee_id = 'a0a0a0a0-0000-4000-8000-000000000001';
  insert into public.employee_payment_details (company_id, employee_id, contract_type, hourly_pay_cents)
  values (co, outra, 'pj', 6000);

  insert into public.visits (id, company_id, client_id, location_id, kind, visit_date, starts_at, ends_at, status)
  values ('b1b1b1b1-0000-4000-8000-000000000001', co, 'f3f3f3f3-0000-4000-8000-000000000003', 'f4f4f4f4-0000-4000-8000-000000000004',
    'execution', '2020-03-10', '08:00', '12:00', 'completed');
  insert into public.visit_employees (company_id, visit_id, employee_id, time_range, blocks_schedule)
  values (co, 'b1b1b1b1-0000-4000-8000-000000000001', outra, tsrange('2020-03-10 08:00', '2020-03-10 12:00', '[)'), false);
end $$;

-- Member e técnico não leem nem agem; outra empresa também não.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d3d3d3d3-0000-4000-8000-000000000003","email":"rls-member@test.local","role":"authenticated"}', true);
do $$
declare n int; co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  select count(*) into n from public.expenses;
  if n <> 0 then raise exception 'FALHA gastos: member leu gastos'; end if;
  select count(*) into n from public.expense_templates;
  if n <> 0 then raise exception 'FALHA gastos: member leu modelos'; end if;
  select count(*) into n from public.expense_categories;
  if n <> 0 then raise exception 'FALHA gastos: member leu categorias'; end if;
  select count(*) into n from public.time_entries;
  if n <> 0 then raise exception 'FALHA horas: member leu apontamentos'; end if;
  begin
    perform public.get_hours_month(co, '2031-05-01');
    raise exception 'FALHA horas: member abriu horas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.close_contractor_month(co, 'a0a0a0a0-0000-4000-8000-000000000002', '2020-03-01');
    raise exception 'FALHA horas: member fechou';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.generate_due_expenses();
    raise exception 'FALHA gastos: member chamou o job';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"e4e4e4e4-0000-4000-8000-000000000004","email":"rls-tecnico@test.local","role":"authenticated"}', true);
do $$
declare n int; co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  select count(*) into n from public.time_entries;
  if n <> 0 then raise exception 'FALHA horas: técnico leu apontamentos'; end if;
  select count(*) into n from public.expenses;
  if n <> 0 then raise exception 'FALHA gastos: técnico leu gastos'; end if;
  begin
    perform public.delete_expense(co, gen_random_uuid());
    raise exception 'FALHA gastos: técnico excluiu';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
declare n int; co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
begin
  select count(*) into n from public.expenses where company_id = co;
  if n <> 0 then raise exception 'FALHA gastos: outra empresa leu'; end if;
  select count(*) into n from public.time_entries where company_id = co;
  if n <> 0 then raise exception 'FALHA horas: outra empresa leu'; end if;
  begin
    perform public.get_hours_month(co, '2031-05-01');
    raise exception 'FALHA horas: outra empresa abriu horas';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.expense_categories where company_id = 'c2c2c2c2-0000-4000-8000-000000000002';
  if n <> 8 then raise exception 'FALHA gastos: outra empresa sem categorias próprias'; end if;
end $$;

-- Owner: sugestão, ajuste, sobreposição, retirar e restaurar, fechar, pago travado, reabrir.
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare
  co uuid := 'c1c1c1c1-0000-4000-8000-000000000001';
  outra uuid := 'a0a0a0a0-0000-4000-8000-000000000002';
  tec uuid := 'a0a0a0a0-0000-4000-8000-000000000001';
  visita uuid := 'b1b1b1b1-0000-4000-8000-000000000001';
  mes date := '2020-03-01';
  v_month jsonb; v_avulsa uuid; v_expense uuid; v_amount int; v_status text; n int;
begin
  v_month := public.get_hours_month(co, mes);
  if jsonb_array_length(v_month -> 'suggestions') <> 1 then raise exception 'FALHA horas: visita passada não sugeriu'; end if;

  -- CLT não fecha; sem horas não fecha.
  begin
    perform public.close_contractor_month(co, tec, mes);
    raise exception 'FALHA horas: CLT fechou';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Retirada não é paga.
  perform public.set_suggestion_dismissed(co, visita, outra, true);
  begin
    perform public.close_contractor_month(co, outra, mes);
    raise exception 'FALHA horas: fechou sem nada em aberto';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  perform public.set_suggestion_dismissed(co, visita, outra, false);

  -- Avulsa: 13:00–19:30 tem 6h30 e, com 30 min de intervalo, 6h de trabalho.
  v_avulsa := public.save_time_entry(co, null, outra, '2020-03-10', '13:00', '19:30', 30, null, null, 'Avulsa');

  begin
    perform public.save_time_entry(co, null, outra, '2020-03-10', '19:00', '20:00', 0, null, null, '');
    raise exception 'FALHA horas: aceitou sobreposição';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_time_entry(co, null, outra, '2020-03-11', '10:00', '11:00', 60, null, null, '');
    raise exception 'FALHA horas: intervalo maior que a jornada';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.save_time_entry(co, null, outra, current_date + 2, '10:00', '11:00', 0, null, null, '');
    raise exception 'FALHA horas: aceitou data futura';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Avulsa em cima de uma sugestão é recusada de saída, não só ao fechar.
  begin
    perform public.save_time_entry(co, null, outra, '2020-03-10', '11:00', '12:30', 0, null, null, '');
    raise exception 'FALHA horas: aceitou avulsa sobre sugestão';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Fechar paga a avulsa (6h) e a sugestão (4h): 10h × R$ 60.
  v_expense := public.close_contractor_month(co, outra, mes);
  select amount_cents into v_amount from public.expenses where id = v_expense;
  if v_amount <> 60000 then raise exception 'FALHA horas: gasto de %, esperado 60000', v_amount; end if;
  select count(*) into n from public.time_entries where expense_id = v_expense and status = 'paid';
  if n <> 2 then raise exception 'FALHA horas: % apontamentos pagos, esperado 2', n; end if;

  -- Pago não muda.
  begin
    perform public.save_time_entry(co, v_avulsa, outra, '2020-03-10', '13:00', '14:00', 0, null, null, '');
    raise exception 'FALHA horas: alterou pago';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.remove_time_entry(co, v_avulsa);
    raise exception 'FALHA horas: excluiu pago';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.set_time_entry_status(co, v_avulsa, 'pending');
    raise exception 'FALHA horas: mudou status de pago';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Excluir o gasto reabre as horas.
  perform public.delete_expense(co, v_expense);
  select status into v_status from public.time_entries where id = v_avulsa;
  if v_status <> 'approved' then raise exception 'FALHA horas: excluir gasto não reabriu'; end if;
  select count(*) into n from public.expenses where id = v_expense and deleted_at is null;
  if n <> 0 then raise exception 'FALHA gastos: gasto continuou ativo'; end if;

  -- Retirar apontamento de visita não deixa a sugestão voltar.
  select id into v_avulsa from public.time_entries where visit_id = visita and employee_id = outra;
  perform public.remove_time_entry(co, v_avulsa);
  v_month := public.get_hours_month(co, mes);
  if not (v_month -> 'suggestions' -> 0 ->> 'dismissed')::boolean then
    raise exception 'FALHA horas: retirado voltou como sugestão ativa';
  end if;

  -- Direto nas tabelas não dá.
  begin
    update public.time_entries set status = 'paid' where company_id = co;
    raise exception 'FALHA horas: alterou direto';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Catálogo de planos: quem não é super admin não escreve nem lê o histórico.
-- ---------------------------------------------------------------------------
insert into public.plan_audit_log (plan_id, action, new_values)
select id, 'updated', '{}' from public.plans where code = 'pro';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.plan_audit_log;
  if n <> 0 then raise exception 'FALHA planos: usuário comum leu plan_audit_log'; end if;

  update public.plans set price_cents = 1 where code = 'pro';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA planos: usuário comum alterou um plano'; end if;
exception when insufficient_privilege then
  null;
end $$;

do $$
begin
  perform public.admin_set_plan_active(id, false, auth.uid()) from public.plans where code = 'pro';
  raise exception 'FALHA planos: usuário comum executou admin_set_plan_active';
exception when insufficient_privilege then
  null;
end $$;

reset role;

insert into public.platform_admins (user_id) values ('a1a1a1a1-0000-4000-8000-000000000001');
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.plan_audit_log;
  if n = 0 then raise exception 'FALHA planos: super admin não leu plan_audit_log'; end if;
end $$;

reset role;
delete from public.platform_admins where user_id = 'a1a1a1a1-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Exclusão de usuário: FKs de autoria não podem impedir (LGPD, art. 18).
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  delete from auth.users where id = 'b2b2b2b2-0000-4000-8000-000000000002';

  select count(*) into n from public.profiles where id = 'b2b2b2b2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA exclusão: profile do bob sobreviveu'; end if;

  select count(*) into n from public.companies
  where id = 'c2c2c2c2-0000-4000-8000-000000000002' and created_by is null;
  if n <> 1 then raise exception 'FALHA exclusão: companies.created_by não virou NULL'; end if;

  select count(*) into n from public.audit_logs
  where company_id = 'c2c2c2c2-0000-4000-8000-000000000002' and user_id is not null;
  if n <> 0 then raise exception 'FALHA exclusão: auditoria manteve o user_id do bob'; end if;
end $$;

rollback;

\echo 'RLS OK: todos os testes de isolamento multi-tenant passaram.'
