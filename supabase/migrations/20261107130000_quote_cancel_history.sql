-- Orçamento cancelado (diferente de recusado: a empresa ou o cliente desistiu depois de enviado ou
-- aprovado) e histórico de mudanças dentro do orçamento.

alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('draft', 'sent', 'approved', 'refused', 'expired', 'closed', 'canceled'));
alter table public.quotes add column canceled_at timestamptz;

-- Cancelar: de enviado, aprovado ou expirado. Final, como recusado; "Duplicar" cria uma nova versão.
-- Fechado não cancela: desfaça o fechamento antes.
create or replace function public.transition_quote(p_company_id uuid, p_quote_id uuid, p_action text, p_valid_until date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote public.quotes;
  v_valid date;
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para alterar orçamentos' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;

  if p_action = 'send' and v_quote.status = 'draft' then
    if v_quote.client_id is null then
      raise exception 'Escolha o cliente.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
      raise exception 'Adicione pelo menos um item.' using errcode = 'P0001';
    end if;
    v_valid := coalesce(
      v_quote.valid_until,
      public.company_today(p_company_id) + coalesce(
        (select quote_validity_days from public.company_profiles where company_id = p_company_id), 15
      )
    );
    if v_valid < public.company_today(p_company_id) then
      raise exception 'A validade já passou. Informe uma nova data.' using errcode = 'P0001';
    end if;
    update public.quotes set status = 'sent', sent_at = now(), valid_until = v_valid where id = p_quote_id;
  elsif p_action = 'approve' and v_quote.status = 'sent' then
    update public.quotes set status = 'approved', approved_at = now() where id = p_quote_id;
  elsif p_action = 'refuse' and v_quote.status in ('draft', 'sent') then
    update public.quotes set status = 'refused', refused_at = now() where id = p_quote_id;
  elsif p_action = 'cancel' and v_quote.status in ('sent', 'approved', 'expired') then
    update public.quotes set status = 'canceled', canceled_at = now() where id = p_quote_id;
  elsif p_action = 'expire' and v_quote.status = 'sent' then
    update public.quotes set status = 'expired' where id = p_quote_id;
  elsif p_action = 'reopen' and v_quote.status = 'expired' then
    if p_valid_until is null or p_valid_until < public.company_today(p_company_id) then
      raise exception 'Informe uma nova validade, a partir de hoje.' using errcode = 'P0001';
    end if;
    update public.quotes set status = 'draft', sent_at = null, valid_until = p_valid_until where id = p_quote_id;
  else
    raise exception 'Essa mudança de status não é permitida.' using errcode = 'P0001';
  end if;
end;
$function$;

-- Excluir: a mensagem passa a citar o cancelado.
create or replace function public.delete_quote(p_company_id uuid, p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Só owner e admin excluem orçamentos' using errcode = '42501';
  end if;

  select status into v_status from public.quotes
  where id = p_quote_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_status in ('approved', 'closed') then
    raise exception 'Orçamentos aprovados ou fechados não podem ser excluídos.' using errcode = 'P0001';
  end if;
  if v_status = 'sent' then
    raise exception 'Este orçamento está com o cliente. Marque como recusado, cancelado ou expirado antes de excluir.' using errcode = 'P0001';
  end if;

  update public.quotes set deleted_at = now() where id = p_quote_id;
end;
$function$;

-- Histórico do orçamento: o que a auditoria registrou sobre ele, do mais novo ao mais antigo, com o
-- nome de quem fez. A auditoria inteira é só de owner e admin; este recorte vale para todo o
-- escritório (owner, admin e member), que é quem trabalha o orçamento.
create or replace function public.quote_history(p_company_id uuid, p_quote_id uuid)
returns table (action text, created_at timestamptz, user_name text, metadata jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para ver o histórico' using errcode = '42501';
  end if;
  return query
    select a.action, a.created_at, p.full_name, a.metadata
    from public.audit_logs a
    left join public.profiles p on p.id = a.user_id
    where a.company_id = p_company_id
      and a.entity_type = 'quote'
      and a.entity_id = p_quote_id
      and a.deleted_at is null
    order by a.created_at desc
    limit 200;
end;
$$;

revoke execute on function public.quote_history(uuid, uuid) from public, anon;
grant execute on function public.quote_history(uuid, uuid) to authenticated, service_role;

-- O vencimento automático também entra no histórico (sem usuário: foi o sistema).
create or replace function public.expire_due_quotes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.quotes q
    set status = 'expired'
    where q.status = 'sent'
      and q.deleted_at is null
      and q.valid_until < public.company_today(q.company_id)
    returning q.id, q.company_id
  )
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select company_id, null, 'quote.expire', 'quote', id, jsonb_build_object('automatic', true)
  from expired;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
