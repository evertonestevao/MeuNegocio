-- Excluir plano: só quando ninguém usa. A exclusão é lógica (plans.deleted_at, como o projeto faz em
-- toda tabela): o plano some da oferta e das telas, e o histórico continua em plan_audit_log.
--
-- "Em uso" é qualquer um destes, ainda não apagado:
--   - assinatura de empresa neste plano (qualquer status: a empresa ainda o mostra como o plano dela);
--   - cliente de vendedor ligado ao plano (reseller_clients);
--   - regra de comissão deste plano (commission_rules).
-- Plano em uso não se exclui: desative-o, que ele sai da oferta e quem já assina continua nele.

-- O histórico ganha a ação "deleted".
alter table public.plan_audit_log drop constraint if exists plan_audit_log_action_check;
alter table public.plan_audit_log
  add constraint plan_audit_log_action_check
  check (action in ('created', 'updated', 'activated', 'deactivated', 'access_granted', 'access_revoked', 'deleted'));

-- Quanto cada plano é usado, para a tela de planos mostrar "em uso por N" e travar o botão Excluir.
create function public.admin_plan_usage()
returns table (plan_id uuid, subscribers integer, reseller_links integer, commission_rules integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*)::integer from public.subscriptions s where s.plan_id = p.id and s.deleted_at is null),
    (select count(*)::integer from public.reseller_clients c where c.plan_id = p.id and c.deleted_at is null),
    (select count(*)::integer from public.commission_rules r where r.plan_id = p.id and r.deleted_at is null)
  from public.plans p
  where p.deleted_at is null;
$$;

revoke execute on function public.admin_plan_usage() from public, anon, authenticated;
grant execute on function public.admin_plan_usage() to service_role;

-- Exclui o plano e registra no histórico, na mesma transação. Reconfere o uso aqui, com o plano
-- travado, porque a tela pode estar desatualizada. O código do plano é liberado (renomeado) para um
-- plano novo poder usar o mesmo código, já que plans.code é único mesmo entre os excluídos.
create function public.admin_delete_plan(p_plan_id uuid, p_actor uuid)
returns public.plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.plans;
  v_new public.plans;
  v_in_use integer;
begin
  select * into v_old from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  select
    (select count(*) from public.subscriptions where plan_id = p_plan_id and deleted_at is null)
    + (select count(*) from public.reseller_clients where plan_id = p_plan_id and deleted_at is null)
    + (select count(*) from public.commission_rules where plan_id = p_plan_id and deleted_at is null)
  into v_in_use;
  if v_in_use > 0 then
    raise exception 'plan_in_use';
  end if;

  update public.plans
  set deleted_at = now(),
      is_active = false,
      code = code || '_excluido_' || substr(id::text, 1, 8)
  where id = p_plan_id
  returning * into v_new;

  -- A lista de e-mails de um plano privado não faz mais sentido sem o plano.
  delete from public.plan_access_emails where plan_id = p_plan_id;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (v_new.id, 'deleted', p_actor, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

revoke execute on function public.admin_delete_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_plan(uuid, uuid) to service_role;
