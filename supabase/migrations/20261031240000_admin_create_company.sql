-- Empresa criada pelo super admin: empresa, proprietário e plano opcional, em uma transação. Quem
-- chama é o servidor, depois de revalidar o super admin. Sem pagamento no gateway, o plano não
-- renova: vale pelo período do plano e depois volta ao padrão, até ser renovado.
create function public.admin_create_company(
  p_name text,
  p_slug text,
  p_owner uuid,
  p_plan_id uuid,
  p_actor uuid
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_interval text;
begin
  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, p_owner)
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_company.id, p_owner, 'owner', p_actor);

  if p_plan_id is not null then
    select billing_interval into v_interval
    from public.plans
    where id = p_plan_id and deleted_at is null and is_active and price_cents > 0;
    if not found then
      raise exception 'plan_not_found' using errcode = 'P0002';
    end if;

    insert into public.subscriptions (company_id, plan_id, status, current_period_start, current_period_end, renews)
    values (
      v_company.id, p_plan_id, 'active', now(),
      now() + case when v_interval = 'year' then interval '1 year' else interval '1 month' end,
      false
    );
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_company.id, p_actor, 'company.created', 'company', v_company.id, jsonb_build_object('plan_id', p_plan_id));

  return v_company;
end;
$$;

revoke execute on function public.admin_create_company(text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_company(text, text, uuid, uuid, uuid) to service_role;
