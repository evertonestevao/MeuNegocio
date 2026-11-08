-- P-05: o teste grátis passa a valer uma vez por DONO, não por empresa.
--
-- Controlar por empresa deixava emendar vários testes, já que criar empresa não
-- tem limite. A função acha o dono da empresa e responde se qualquer empresa que
-- esse dono tem já teve assinatura — inclui o histórico apagado (reassinatura
-- marca a anterior com deleted_at, mas ela conta como "já assinou/testou").
create or replace function public.owner_has_subscription_history(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members target_owner
    join public.company_members owned
      on owned.user_id = target_owner.user_id
     and owned.role = 'owner'
     and owned.deleted_at is null
    join public.subscriptions s on s.company_id = owned.company_id
    where target_owner.company_id = p_company_id
      and target_owner.role = 'owner'
      and target_owner.deleted_at is null
  );
$$;

-- Só o servidor (service_role) consulta, pelo billing. authenticated não precisa.
grant execute on function public.owner_has_subscription_history(uuid) to service_role;
