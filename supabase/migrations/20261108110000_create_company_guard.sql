-- P-03: endurecer create_company (RPC pública que qualquer usuário logado chama).
--
-- Uma conta criada direto na API (sem passar pelo app) não aceita os termos e
-- poderia virar uma empresa usável. Agora create_company exige que o usuário
-- tenha ao menos um aceite de termos registrado (o app grava no cadastro, antes
-- de criar a empresa). Também limita quantas empresas um usuário cria, contra
-- criação automatizada em massa (que alimentaria abuso de teste grátis).
create or replace function public.create_company(p_name text, p_slug text)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_owned integer;
begin
  if not exists (select 1 from public.terms_acceptances where user_id = auth.uid()) then
    raise exception 'Aceite os termos de uso antes de criar uma empresa' using errcode = '42501';
  end if;

  select count(*) into v_owned
  from public.company_members
  where user_id = auth.uid() and role = 'owner' and deleted_at is null;
  if v_owned >= 5 then
    raise exception 'Limite de empresas por usuário atingido' using errcode = 'MN001';
  end if;

  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  return v_company;
end;
$$;
