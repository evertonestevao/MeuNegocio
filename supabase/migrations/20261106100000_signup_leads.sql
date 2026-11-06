-- Cadastro em etapas: nome e e-mail ficam guardados logo na primeira tela, antes da senha e da
-- assinatura, junto com a prova do aceite dos termos. Tabela da plataforma, como plans: ainda não
-- existe empresa, por isso não tem company_id. Só o servidor (service_role) grava; o super admin lê
-- para chamar quem parou no meio. Os dados somem sozinhos depois de 90 dias (LGPD).

create table public.signup_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) <= 254),
  full_name text not null check (length(full_name) between 2 and 120),
  -- Até onde chegou: contact (nome e e-mail), account (criou a senha e a empresa), done (terminou).
  stage text not null default 'contact' check (stage in ('contact', 'account', 'done')),
  -- Prova do aceite, gravada no primeiro passo; vira terms_acceptances quando a conta nasce.
  terms_version_id uuid references public.terms_versions (id),
  accepted_at timestamptz not null,
  email_consent boolean not null default false,
  ip_address text,
  user_agent text,
  user_id uuid references auth.users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index signup_leads_updated_at_idx on public.signup_leads (updated_at);

alter table public.signup_leads enable row level security;

revoke all on public.signup_leads from anon, authenticated;
grant select on public.signup_leads to authenticated;

create policy "signup_leads_select_super_admin"
  on public.signup_leads
  for select
  to authenticated
  using (public.is_super_admin());

-- Empresa criada pelo cadastro em etapas: o nome é provisório até a pessoa preencher os dados
-- essenciais. Empresas antigas ou criadas pelo super admin não passam por essa tela.
alter table public.companies add column onboarding_pending boolean not null default false;

create or replace function public.purge_old_signup_leads()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.signup_leads where updated_at < now() - interval '90 days';
$$;

revoke execute on function public.purge_old_signup_leads() from public, anon, authenticated;

select cron.schedule('purge-old-signup-leads', '17 3 * * *', 'select public.purge_old_signup_leads()');
