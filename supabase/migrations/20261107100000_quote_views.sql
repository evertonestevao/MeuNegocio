-- Quando o cliente abriu o link do orçamento: primeira e última abertura e quantas vezes.
-- Tabela própria, e não colunas em quotes: gravar ali mudaria o updated_at do orçamento, que a
-- tela do escritório usa para recarregar o editor.

create table public.quote_views (
  quote_id uuid primary key,
  company_id uuid not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  -- Aberturas com pelo menos 30 minutos entre uma e outra: recarregar a página não conta de novo.
  view_count integer not null default 1 check (view_count > 0),
  deleted_at timestamptz,
  foreign key (company_id, quote_id) references public.quotes (company_id, id) on delete cascade
);

create index quote_views_company_idx on public.quote_views (company_id);

alter table public.quote_views enable row level security;

-- Quem vê o orçamento vê quando o cliente abriu: owner, admin e member (técnico não).
create policy quote_views_select_office on public.quote_views
  for select to authenticated
  using (deleted_at is null and public.is_company_office(company_id));

revoke all on public.quote_views from anon, authenticated;
grant select on public.quote_views to authenticated;

-- Só o servidor grava, pelo token do link e com service_role. Rascunho e orçamento excluído não
-- contam; quem não acha o orçamento não recebe erro nenhum (o link já respondeu 404 antes).
create or replace function public.record_quote_view(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_company_id uuid;
begin
  select id, company_id into v_quote_id, v_company_id
  from public.quotes
  where public_token = p_token and deleted_at is null and status <> 'draft';
  if v_quote_id is null then
    return;
  end if;

  insert into public.quote_views (quote_id, company_id)
  values (v_quote_id, v_company_id)
  on conflict (quote_id) do update set
    view_count = public.quote_views.view_count
      + case when public.quote_views.last_viewed_at < now() - interval '30 minutes' then 1 else 0 end,
    last_viewed_at = now();
end;
$$;

revoke execute on function public.record_quote_view(text) from public, anon, authenticated;
grant execute on function public.record_quote_view(text) to service_role;
