-- P-08: o técnico não deve ler os dados financeiros da empresa.
--
-- A policy de SELECT de company_profiles liberava a linha inteira para qualquer
-- membro (is_company_member inclui o técnico), expondo pela API regime
-- tributário, alíquota, taxas de cartão e meta de margem — dados que nenhuma
-- tela mostra ao técnico. RLS no Postgres é por linha, não por coluna, então:
--   1) a leitura direta da tabela passa a exigir o escritório (owner/admin/member);
--   2) o técnico recebe só o subconjunto de contato (o mesmo que já vai no PDF
--      que o cliente assina) por uma função security definer.

-- 1) Leitura da tabela só para o escritório. is_company_office já cobre
--    owner, admin e member; o técnico fica de fora. Escrita continua sendo
--    admin (policies de insert/update inalteradas).
drop policy if exists company_profiles_select_member on public.company_profiles;

create policy company_profiles_select_office
  on public.company_profiles
  for select
  using (public.is_company_office(company_id));

-- 2) Subconjunto não sensível para qualquer membro (inclui o técnico), usado na
--    ordem de serviço e no cabeçalho dos documentos. Sem colunas de imposto,
--    taxa de cartão ou margem.
create or replace function public.get_company_doc_profile(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  select to_jsonb(t) into v_profile
  from (
    select company_id, logo_path, cnpj, phone, email, address, timezone,
           quote_validity_days, quote_default_notes
    from public.company_profiles
    where company_id = p_company_id and deleted_at is null
  ) t;

  return v_profile; -- null quando a empresa ainda não preencheu o perfil
end;
$$;

grant execute on function public.get_company_doc_profile(uuid) to authenticated;
