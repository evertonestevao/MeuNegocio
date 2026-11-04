-- Imposto estimado por serviço. A empresa informa o regime e a alíquota padrão; cada orçamento
-- guarda a alíquota na aprovação, para o resultado de um serviço antigo não mudar quando a
-- alíquota da empresa mudar. Owner e admin podem ajustar a de um serviço aprovado ou fechado.
-- Alíquota em centésimos de ponto percentual: 8,43% = 843.

alter table public.company_profiles
  add column tax_regime text check (tax_regime in ('mei', 'simples', 'other')),
  add column tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 4000);

-- NULL: o orçamento ainda segue a alíquota atual da empresa (rascunho, ou aprovado antes disto).
alter table public.quotes
  add column tax_rate_bps integer check (tax_rate_bps is null or tax_rate_bps between 0 and 4000);

-- Congela a alíquota quando o orçamento é aprovado, pela tela ou pelo link do cliente.
create or replace function public.freeze_quote_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.tax_rate_bps is null then
    select case when p.tax_regime is null then null when p.tax_regime = 'mei' then 0 else p.tax_rate_bps end
    into new.tax_rate_bps
    from public.company_profiles p
    where p.company_id = new.company_id and p.deleted_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.freeze_quote_tax_rate() from public, anon, authenticated;

create trigger freeze_quote_tax_rate
  before update of status on public.quotes
  for each row execute function public.freeze_quote_tax_rate();

create or replace function public.set_quote_tax_rate(p_company_id uuid, p_quote_id uuid, p_tax_rate_bps integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só o proprietário e o administrador alteram o imposto do serviço' using errcode = '42501';
  end if;
  if p_tax_rate_bps is null or p_tax_rate_bps not between 0 and 4000 then
    raise exception 'Informe uma alíquota de 0%% a 40%%.' using errcode = 'P0001';
  end if;

  update public.quotes
  set tax_rate_bps = p_tax_rate_bps
  where id = p_quote_id and company_id = p_company_id and deleted_at is null and status in ('approved', 'closed');
  if not found then
    raise exception 'Escolha um serviço aprovado ou fechado.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.set_quote_tax_rate(uuid, uuid, integer) from public, anon;
grant execute on function public.set_quote_tax_rate(uuid, uuid, integer) to authenticated;
