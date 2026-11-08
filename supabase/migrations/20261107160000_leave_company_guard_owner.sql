-- P-07: o proprietário não pode sair da própria empresa pela função do banco.
--
-- O service (tenantService.leaveCompany) já recusava o owner, mas a função
-- leave_company não — chamada direto pela API, o dono saía e a empresa ficava
-- sem dono. A regra passa a valer também no banco, como já acontece em
-- transfer_company_ownership. Para trocar de dono, use transfer_company_ownership.
create or replace function public.leave_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_company_owner(p_company_id) then
    raise exception 'O proprietário não pode sair da própria empresa; transfira a empresa antes'
      using errcode = '42501';
  end if;

  update public.company_members
  set deleted_at = now()
  where company_id = p_company_id
    and user_id = auth.uid()
    and deleted_at is null;
end;
$$;
