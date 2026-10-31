-- Fecha caminhos que passavam por cima das regras do app chamando a API do Supabase direto com
-- o token do próprio usuário. As regras dos services continuam (dão a mensagem amigável); o banco
-- passa a ser a barreira final. Regressão coberta por supabase/tests/security_regression_test.sql.
--
-- Guardas de papel são security invoker de propósito: dentro de uma RPC security definer o
-- current_user é o dono da função, então elas só atuam em escrita direta de authenticated.
-- Travas de plano são security definer: valem para todos os caminhos e precisam ler a assinatura,
-- que a RLS esconde de member.

-- ---------------------------------------------------------------------------
-- Assinatura: só o servidor escreve (webhook e cancelamento, com service_role). Antes, o owner
-- podia se dar qualquer plano sem pagar.
-- ---------------------------------------------------------------------------
drop policy "subscriptions_insert_owner" on public.subscriptions;
drop policy "subscriptions_update_owner" on public.subscriptions;
revoke insert, update on public.subscriptions from authenticated;

-- Preço contratado: editar um plano não muda quem já assina.
alter table public.subscriptions
  add column contracted_price_cents integer,
  add column contracted_extra_seat_price_cents integer;

update public.subscriptions s
set contracted_price_cents = p.price_cents,
    contracted_extra_seat_price_cents = p.extra_seat_price_cents
from public.plans p
where p.id = s.plan_id;

alter table public.subscriptions
  alter column contracted_price_cents set not null,
  alter column contracted_extra_seat_price_cents set not null;

create or replace function public.set_subscription_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id then
    select price_cents, extra_seat_price_cents
    into new.contracted_price_cents, new.contracted_extra_seat_price_cents
    from public.plans
    where id = new.plan_id;
  else
    new.contracted_price_cents := old.contracted_price_cents;
    new.contracted_extra_seat_price_cents := old.contracted_extra_seat_price_cents;
  end if;
  return new;
end;
$$;

create trigger set_subscription_contract
  before insert or update on public.subscriptions
  for each row
  execute function public.set_subscription_contract();

-- ---------------------------------------------------------------------------
-- Termos efetivos do plano, com a mesma regra do billingService.getEffectivePlan. Assinatura
-- ativa, em teste ou em atraso vale; qualquer outro caso cai no plano free.
-- ---------------------------------------------------------------------------
create or replace function public.company_plan_terms(p_company_id uuid)
returns table (features jsonb, extra_seat_price_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  select features, extra_seat_price_cents
  from (
    select p.features, s.contracted_extra_seat_price_cents as extra_seat_price_cents, 0 as priority
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.company_id = p_company_id
      and s.deleted_at is null
      and s.status in ('trialing', 'active', 'past_due')
    union all
    select p.features, p.extra_seat_price_cents, 1
    from public.plans p
    where p.code = 'free' and p.deleted_at is null
  ) terms
  order by priority
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Membros: entrada só por convite ou criação de empresa (RPCs). Direto, só muda papel e remove,
-- e só sobre quem está abaixo na hierarquia. Owner muda apenas por transfer_company_ownership.
-- ---------------------------------------------------------------------------
drop policy "company_members_insert_admin" on public.company_members;
revoke insert on public.company_members from authenticated;

create or replace function public.role_level(p_role text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 when 'technician' then 1 else 0 end;
$$;

create or replace function public.guard_company_member_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
    or new.invited_by is distinct from old.invited_by
    or new.created_at is distinct from old.created_at
    or old.deleted_at is not null
    or new.role = 'owner'
  then
    raise exception 'Alteração de membro não permitida' using errcode = '42501';
  end if;

  select role into v_actor_role
  from public.company_members
  where company_id = old.company_id and user_id = auth.uid() and deleted_at is null;

  if public.role_level(v_actor_role) <= public.role_level(old.role) then
    raise exception 'Sem permissão sobre este membro' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_company_member_write
  before update on public.company_members
  for each row
  execute function public.guard_company_member_write();

-- ---------------------------------------------------------------------------
-- Convites: nunca para owner; direto, só nascem pendentes com prazo padrão e só podem ser
-- revogados. Antes, um admin criava convite de owner ou reabria e estendia convites.
-- ---------------------------------------------------------------------------
update public.company_invites
set status = 'revoked'
where role = 'owner' and status = 'pending';

alter table public.company_invites
  add constraint company_invites_role_not_owner check (role <> 'owner' or status <> 'pending');

create or replace function public.guard_company_invite_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.token := gen_random_uuid();
    new.expires_at := now() + interval '7 days';
    new.deleted_at := null;
    return new;
  end if;

  if old.status <> 'pending'
    or new.status not in ('pending', 'revoked')
    or new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.invited_by is distinct from old.invited_by
    or new.token is distinct from old.token
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Alteração de convite não permitida' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_company_invite_write
  before insert or update on public.company_invites
  for each row
  execute function public.guard_company_invite_write();

-- ---------------------------------------------------------------------------
-- Empresa: admin edita nome e slug. Encerrar e trocar o criador ficam com o servidor.
-- ---------------------------------------------------------------------------
create or replace function public.guard_company_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.deleted_at is distinct from old.deleted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Alteração de empresa não permitida' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_company_write
  before update on public.companies
  for each row
  execute function public.guard_company_write();

-- ---------------------------------------------------------------------------
-- Auditoria: só o servidor e as RPCs gravam. Antes, qualquer membro inseria eventos falsos,
-- inclusive sem autor.
-- ---------------------------------------------------------------------------
drop policy "audit_logs_insert_member" on public.audit_logs;
revoke insert on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- Settings: override de feature (feature:*) abriria recurso pago; só o servidor grava.
-- ---------------------------------------------------------------------------
drop policy "settings_insert_admin" on public.settings;
drop policy "settings_update_admin" on public.settings;

create policy "settings_insert_admin"
  on public.settings
  for insert
  to authenticated
  with check (public.is_company_admin(company_id) and key not like 'feature:%');

create policy "settings_update_admin"
  on public.settings
  for update
  to authenticated
  using (public.is_company_admin(company_id) and key not like 'feature:%')
  with check (public.is_company_admin(company_id) and key not like 'feature:%');

-- ---------------------------------------------------------------------------
-- Limites de plano no banco: valem para o app, para a API e para as RPCs. O SQLSTATE MN001 é o
-- código que os repositórios traduzem para a mensagem de limite. Quem já está acima do limite não
-- perde nada: só não cria mais.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms record;
  v_included integer;
  v_used integer;
begin
  if tg_table_name = 'company_members' and new.role = 'owner' then
    return new;
  end if;

  select * into v_terms from public.company_plan_terms(new.company_id);
  if jsonb_typeof(v_terms.features -> 'max_members') <> 'number'
    or v_terms.extra_seat_price_cents > 0
  then
    return new;
  end if;
  v_included := (v_terms.features ->> 'max_members')::integer;

  -- Serializa por empresa: dois convites simultâneos não passam juntos da última vaga.
  perform pg_advisory_xact_lock(hashtextextended('seats:' || new.company_id::text, 0));

  select count(*) into v_used
  from public.company_members
  where company_id = new.company_id and deleted_at is null;

  if tg_table_name = 'company_invites' then
    -- Convite pendente reserva vaga.
    v_used := v_used + (
      select count(*) from public.company_invites
      where company_id = new.company_id and status = 'pending' and deleted_at is null
    );
  elsif exists (
    select 1 from public.company_members
    where company_id = new.company_id and user_id = new.user_id and deleted_at is null
  ) then
    return new; -- quem já é membro não ocupa outra vaga
  end if;

  if v_used >= v_included then
    raise exception 'Limite de membros do plano atingido' using errcode = 'MN001';
  end if;
  return new;
end;
$$;

create trigger enforce_seat_limit
  before insert on public.company_invites
  for each row
  when (new.status = 'pending')
  execute function public.enforce_seat_limit();

create trigger enforce_seat_limit
  before insert on public.company_members
  for each row
  execute function public.enforce_seat_limit();

create or replace function public.enforce_client_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit jsonb;
begin
  select features -> 'max_clients' into v_limit from public.company_plan_terms(new.company_id);
  if jsonb_typeof(v_limit) <> 'number' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('clients:' || new.company_id::text, 0));
  if (
    select count(*) from public.clients where company_id = new.company_id and deleted_at is null
  ) >= (v_limit #>> '{}')::integer then
    raise exception 'Limite de clientes do plano atingido' using errcode = 'MN001';
  end if;
  return new;
end;
$$;

create trigger enforce_client_limit
  before insert on public.clients
  for each row
  execute function public.enforce_client_limit();

-- Conta como o quoteService: tudo o que foi criado no mês, mesmo apagado depois.
create or replace function public.enforce_quote_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit jsonb;
  v_month_start date;
begin
  select features -> 'max_quotes_month' into v_limit from public.company_plan_terms(new.company_id);
  if jsonb_typeof(v_limit) <> 'number' then
    return new;
  end if;

  v_month_start := date_trunc('month', public.company_today(new.company_id))::date;
  perform pg_advisory_xact_lock(hashtextextended('quotes:' || new.company_id::text, 0));
  if (
    select count(*) from public.quotes
    where company_id = new.company_id and created_at >= v_month_start
  ) >= (v_limit #>> '{}')::integer then
    raise exception 'Limite de orçamentos do plano atingido' using errcode = 'MN001';
  end if;
  return new;
end;
$$;

create trigger enforce_quote_limit
  before insert on public.quotes
  for each row
  execute function public.enforce_quote_limit();

-- Recurso pago: bloqueia registro novo. Quem fez downgrade não perde o que já existe.
create or replace function public.enforce_plan_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hora criada pela conclusão de uma OS é consequência da OS, já liberada pelo plano.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if coalesce((
    select (features -> tg_argv[0]) = 'true'::jsonb from public.company_plan_terms(new.company_id)
  ), false) then
    return new;
  end if;
  raise exception 'Recurso não incluído no plano' using errcode = 'MN001';
end;
$$;

create trigger enforce_plan_feature
  before insert on public.work_orders
  for each row
  execute function public.enforce_plan_feature('work_orders');

create trigger enforce_plan_feature
  before insert on public.time_entries
  for each row
  execute function public.enforce_plan_feature('hours');

-- Funções internas: nenhum usuário as chama direto. Triggers não dependem de EXECUTE.
revoke execute on function public.set_subscription_contract() from public, anon, authenticated;
revoke execute on function public.company_plan_terms(uuid) from public, anon, authenticated;
revoke execute on function public.guard_company_invite_write() from public, anon, authenticated;
revoke execute on function public.guard_company_write() from public, anon, authenticated;
revoke execute on function public.guard_company_member_write() from public, anon, authenticated;
revoke execute on function public.enforce_seat_limit() from public, anon, authenticated;
revoke execute on function public.enforce_client_limit() from public, anon, authenticated;
revoke execute on function public.enforce_quote_limit() from public, anon, authenticated;
revoke execute on function public.enforce_plan_feature() from public, anon, authenticated;

-- role_level roda dentro da guarda de membros, como authenticated.
revoke execute on function public.role_level(text) from public, anon;
grant execute on function public.role_level(text) to authenticated;
