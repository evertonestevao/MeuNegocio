-- Plano piloto: ativar só com e-mail liberado e dono da empresa, sem prazo; encerrar guarda a assinatura no
-- histórico, tira o e-mail do dono da lista e não mexe nos dados da empresa. Roda em transação com ROLLBACK.
--
-- Uso: psql -f supabase/tests/pilot_plan_test.sql (com o Supabase local de pé).

\set ON_ERROR_STOP on
begin;
insert into auth.users (id,email,aud,role,instance_id,email_confirmed_at,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','pil-owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),'{}'),
 ('a1000000-0000-4000-8000-000000000002','pil-other@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),'{}');
insert into public.companies (id,name,slug,created_by) values ('a1c00000-0000-4000-8000-000000000001','Piloto Co','pil-co','a1000000-0000-4000-8000-000000000001');
insert into public.company_members (company_id,user_id,role) values ('a1c00000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner');
insert into public.clients (company_id,name) select 'a1c00000-0000-4000-8000-000000000001','Cliente do piloto' where exists (select 1 from information_schema.tables where table_name='clients');

do $$
declare v_plan uuid; v_pro uuid; v_sub public.subscriptions; v_res jsonb; v_terms record; v_n int;
begin
  select id into v_plan from public.plans where code='piloto';
  select id into v_pro from public.plans where code='pro';

  -- 1. sem e-mail liberado: recusa
  begin
    perform public.activate_pilot_plan('a1c00000-0000-4000-8000-000000000001', v_plan, 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FALHOU: ativou sem e-mail liberado';
  exception when sqlstate 'P0002' then null; end;

  insert into public.plan_access_emails (plan_id,email) values (v_plan,'pil-owner@test.local');

  -- 2. quem não é dono da empresa: recusa
  begin
    perform public.activate_pilot_plan('a1c00000-0000-4000-8000-000000000001', v_plan, 'a1000000-0000-4000-8000-000000000002');
    raise exception 'FALHOU: ativou por quem nao e dono';
  exception when sqlstate '42501' then null; end;

  -- 3. plano pago não ativa pela função
  begin
    perform public.activate_pilot_plan('a1c00000-0000-4000-8000-000000000001', v_pro, 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FALHOU: ativou plano pago sem gateway';
  exception when sqlstate 'P0002' then null; end;

  -- 4. ativa
  v_sub := public.activate_pilot_plan('a1c00000-0000-4000-8000-000000000001', v_plan, 'a1000000-0000-4000-8000-000000000001');
  assert v_sub.status='active' and v_sub.current_period_end is null and v_sub.external_subscription_id is null and v_sub.contracted_price_cents=0, 'assinatura piloto errada';
  select * into v_terms from public.company_plan_terms('a1c00000-0000-4000-8000-000000000001');
  assert (v_terms.features->>'work_orders')='true', 'piloto deveria dar os recursos do plano';

  -- 5. já com acesso: não ativa de novo
  begin
    perform public.activate_pilot_plan('a1c00000-0000-4000-8000-000000000001', v_plan, 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FALHOU: ativou duas vezes';
  exception when others then if sqlstate = 'P0001' and sqlerrm = 'already_subscribed' then null; else raise; end if; end;

  -- 6. encerra
  v_res := public.end_pilot_plan('a1c00000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
  assert v_res->'removed_emails' = '["pil-owner@test.local"]'::jsonb, 'e-mail do dono deveria sair da lista';
  select * into v_terms from public.company_plan_terms('a1c00000-0000-4000-8000-000000000001');
  assert (v_terms.features->>'work_orders')='false', 'depois de encerrar volta aos limites do free';
  select count(*) into v_n from public.subscriptions where company_id='a1c00000-0000-4000-8000-000000000001' and deleted_at is null;
  assert v_n=0, 'sem assinatura viva';
  select count(*) into v_n from public.subscriptions where company_id='a1c00000-0000-4000-8000-000000000001';
  assert v_n=1, 'assinatura fica no historico';
  select count(*) into v_n from public.companies where id='a1c00000-0000-4000-8000-000000000001' and deleted_at is null;
  assert v_n=1, 'empresa intacta';
  if exists (select 1 from information_schema.tables where table_name='clients') then
    select count(*) into v_n from public.clients where company_id='a1c00000-0000-4000-8000-000000000001' and deleted_at is null;
    assert v_n=1, 'dados da empresa intactos';
  end if;
  select count(*) into v_n from public.plan_access_emails where plan_id=v_plan and email='pil-owner@test.local';
  assert v_n=0, 'e-mail fora da lista';

  -- 7. sem e-mail na lista, não reativa por conta própria
  begin
    perform public.activate_pilot_plan('a1c00000-0000-4000-8000-000000000001', v_plan, 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FALHOU: reativou sem estar na lista';
  exception when sqlstate 'P0002' then null; end;

  -- 8. encerrar de novo: não há piloto
  begin
    perform public.end_pilot_plan('a1c00000-0000-4000-8000-000000000001', null);
    raise exception 'FALHOU: encerrou sem piloto';
  exception when sqlstate 'P0002' then null; end;

  -- 9. anon/authenticated não executam
  assert not has_function_privilege('authenticated','public.activate_pilot_plan(uuid,uuid,uuid)','execute'), 'authenticated nao pode ativar';
  assert not has_function_privilege('authenticated','public.end_pilot_plan(uuid,uuid)','execute'), 'authenticated nao pode encerrar';

  -- 10. admin_create_company com piloto: sem prazo; com plano pago: 1 mes
  perform public.admin_create_company('Criada com piloto','criada-piloto','a1000000-0000-4000-8000-000000000002', v_plan, 'a1000000-0000-4000-8000-000000000001');
  select s.* into v_sub from public.subscriptions s join public.companies c on c.id=s.company_id where c.slug='criada-piloto';
  assert v_sub.current_period_end is null and v_sub.renews, 'piloto criado pelo admin sem prazo';
  perform public.admin_create_company('Criada paga','criada-paga','a1000000-0000-4000-8000-000000000002', v_pro, 'a1000000-0000-4000-8000-000000000001');
  select s.* into v_sub from public.subscriptions s join public.companies c on c.id=s.company_id where c.slug='criada-paga';
  assert v_sub.current_period_end > now() and not v_sub.renews, 'plano pago criado pelo admin segue com prazo';
  begin
    perform public.admin_create_company('x','x-free','a1000000-0000-4000-8000-000000000002', (select id from public.plans where code='free'), 'a1000000-0000-4000-8000-000000000001');
    raise exception 'FALHOU: liberou o free';
  exception when sqlstate 'P0002' then null; end;
end $$;
rollback;
select 'OK';
