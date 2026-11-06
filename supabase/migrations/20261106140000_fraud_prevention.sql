-- Prevenção de fraude no cadastro de empresas, com prova guardada:
--   1. quem cadastra declara ser responsável pela empresa (texto, data, IP, navegador);
--   2. o CNPJ é conferido na base pública da Receita (só a conclusão, sem a lista de sócios);
--   3. qualquer pessoa denuncia uso indevido, pelo link do orçamento ou pelo site;
--   4. o super admin suspende e reativa, sempre com motivo.
-- As quatro tabelas só recebem linhas novas, gravadas pelo servidor (service_role): ninguém edita
-- nem apaga pela aplicação. Cada linha guarda cópia do que valia na hora (nome, e-mail, empresa),
-- para continuar valendo como prova mesmo se a conta for excluída (user_id vira null).

create table public.company_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  user_id uuid references auth.users (id) on delete set null,
  user_name text not null,
  user_email text not null,
  company_name text not null,
  cnpj text,
  statement text not null,
  terms_version_id uuid references public.terms_versions (id),
  ip_address text,
  user_agent text,
  declared_at timestamptz not null default now()
);
create index company_declarations_company_idx on public.company_declarations (company_id, declared_at desc);

create table public.company_cnpj_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  cnpj text not null,
  informed_name text not null,
  -- match: nome confere; name_mismatch: CNPJ existe, nome não confere; inactive: CNPJ não está
  -- ativo; not_found: CNPJ não existe na base; unavailable: a consulta falhou (tenta de novo depois).
  result text not null check (result in ('match', 'name_mismatch', 'inactive', 'not_found', 'unavailable')),
  official_name text,
  trade_name text,
  situation text,
  opened_on date,
  city text,
  state text,
  -- O nome de quem declarou aparece no quadro de sócios? null quando não houve consulta.
  declarant_in_partners boolean,
  source text not null,
  checked_at timestamptz not null default now()
);
create index company_cnpj_checks_company_idx on public.company_cnpj_checks (company_id, checked_at desc);

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id),
  quote_id uuid references public.quotes (id),
  -- Como a empresa aparecia para quem denunciou, ou o nome que a pessoa informou.
  company_name text check (company_name is null or length(company_name) <= 200),
  reason text not null check (reason in ('impersonation', 'suspicious_charge', 'other')),
  message text not null check (length(message) between 10 and 2000),
  reporter_name text check (reporter_name is null or length(reporter_name) <= 120),
  reporter_contact text not null check (length(reporter_contact) between 5 and 200),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index abuse_reports_created_idx on public.abuse_reports (created_at desc);
create index abuse_reports_company_idx on public.abuse_reports (company_id);

alter table public.companies
  add column suspended_at timestamptz,
  add column suspension_reason text check (suspension_reason is null or length(suspension_reason) between 5 and 1000);

create table public.company_suspension_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  action text not null check (action in ('suspended', 'reactivated')),
  reason text not null check (length(reason) between 5 and 1000),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text not null,
  created_at timestamptz not null default now()
);
create index company_suspension_events_company_idx on public.company_suspension_events (company_id, created_at desc);

-- Só o super admin lê; ninguém grava pela API.
alter table public.company_declarations enable row level security;
alter table public.company_cnpj_checks enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.company_suspension_events enable row level security;

revoke all on public.company_declarations, public.company_cnpj_checks, public.abuse_reports,
  public.company_suspension_events from anon, authenticated;
grant select on public.company_declarations, public.company_cnpj_checks, public.abuse_reports,
  public.company_suspension_events to authenticated;

create policy "company_declarations_select_super_admin" on public.company_declarations
  for select to authenticated using (public.is_super_admin());
create policy "company_cnpj_checks_select_super_admin" on public.company_cnpj_checks
  for select to authenticated using (public.is_super_admin());
create policy "abuse_reports_select_super_admin" on public.abuse_reports
  for select to authenticated using (public.is_super_admin());
create policy "company_suspension_events_select_super_admin" on public.company_suspension_events
  for select to authenticated using (public.is_super_admin());

-- A empresa não se reativa sozinha nem pula o último passo do cadastro pela API.
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
    or new.suspended_at is distinct from old.suspended_at
    or new.suspension_reason is distinct from old.suspension_reason
    or new.onboarding_pending is distinct from old.onboarding_pending
  then
    raise exception 'Alteração de empresa não permitida' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Empresa suspensa: o link do orçamento deixa de abrir (e, sem ele, não há como responder).
CREATE OR REPLACE FUNCTION public.get_public_quote(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'company_id', q.company_id,
    'quote_id', q.id,
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'valid_until', q.valid_until,
    'is_within_validity', q.valid_until >= public.company_today(q.company_id),
    'created_at', q.created_at,
    'subtotal_cents', q.subtotal_cents,
    'discount_cents', q.discount_cents,
    'total_cents', q.total_cents,
    'notes', q.notes,
    'payment_plan', q.payment_plan,
    'company', jsonb_build_object(
      'name', co.name, 'cnpj', p.cnpj, 'phone', p.phone, 'email', p.email, 'address', p.address,
      'logo_path', p.logo_path
    ),
    'client', jsonb_build_object('name', c.name, 'document', c.document),
    'location', case when l.id is null then null
      else jsonb_build_object('name', l.name, 'address', l.address) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', i.description, 'unit', i.unit, 'pricing_mode', i.pricing_mode,
        'quantity', i.quantity, 'people', i.people,
        'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents
      ) order by i.sort_order)
      from public.quote_items i
      where i.quote_id = q.id and i.deleted_at is null
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object('decision', r.decision, 'name', r.name, 'comment', r.comment, 'created_at', r.created_at,
        'signature_path', r.signature_path)
      from public.quote_responses r
      where r.quote_id = q.id and r.deleted_at is null
      order by r.created_at desc
      limit 1
    )
  )
  from public.quotes q
  join public.companies co on co.id = q.company_id and co.deleted_at is null and co.suspended_at is null
  join public.clients c on c.id = q.client_id
  left join public.client_locations l on l.id = q.location_id
  left join public.company_profiles p on p.company_id = q.company_id
  where q.public_token = p_token
    and q.deleted_at is null
    and q.status <> 'draft';
$function$;


-- Termos v2: acrescenta o uso em nome de uma empresa. Todos reaceitam no próximo acesso.
update public.terms_versions set is_current = false where is_current;
insert into public.terms_versions (version, content, is_current)
select coalesce(max(version), 0) + 1,
$terms$# Termos de Uso e Política de Privacidade

**ATENÇÃO: ESTE É UM TEXTO DE EXEMPLO (PLACEHOLDER).**

Este conteúdo existe apenas para validar o fluxo técnico de aceite de termos do starter kit. Ele NÃO tem valor jurídico e DEVE ser substituído por texto redigido e revisado por profissional jurídico antes de qualquer uso com clientes reais.

## 1. Sobre o serviço
Descreva aqui o que o seu produto faz e as condições de uso.

## 2. Uso em nome de uma empresa
Quem cadastra uma empresa declara ser responsável por ela ou estar autorizado por ela, e que os dados informados (nome, CNPJ, logo, telefone e endereço) são verdadeiros. É proibido se passar por outra empresa ou pessoa, usar nome, CNPJ ou logo de terceiros sem autorização e emitir orçamentos ou recibos em nome de quem não autorizou.
A declaração é guardada com data, IP e navegador. O CNPJ informado pode ser conferido na base pública da Receita Federal.
Ao receber denúncia ou identificar indício de uso indevido, podemos suspender o acesso da empresa e o link dos orçamentos enquanto apuramos, e guardar os registros pelo tempo necessário para defesa em processo administrativo ou judicial.

## 3. Dados pessoais
Descreva aqui quais dados são coletados, com qual finalidade e base legal (LGPD, Lei 13.709/2018), por quanto tempo são retidos e como o titular exerce seus direitos.

## 4. Contato
Informe aqui o canal do encarregado de dados (DPO).$terms$,
true
from public.terms_versions;
