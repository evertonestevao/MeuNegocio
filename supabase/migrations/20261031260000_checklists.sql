-- Checklist configurável: modelo por tipo de visita em cada empresa, ajuste por atendimento e
-- inclusão de itens em campo. Ordens já iniciadas guardam a própria lista e não mudam.

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('assessment', 'execution')),
  labels text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, kind)
);

create trigger set_checklist_templates_updated_at
  before update on public.checklist_templates
  for each row execute function public.set_updated_at();

alter table public.checklist_templates enable row level security;

create policy "checklist_templates_select_member" on public.checklist_templates
  for select using (public.is_company_member(company_id) and deleted_at is null);
create policy "checklist_templates_insert_admin" on public.checklist_templates
  for insert with check (public.is_company_admin(company_id));
create policy "checklist_templates_update_admin" on public.checklist_templates
  for update using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

alter table public.visits add column checklist_labels text[];

-- Lista padrão de quem nunca personalizou.
create or replace function public.default_checklist_labels(p_kind text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'assessment' then array[
      'Conferir local e acesso', 'Medir e fotografar o que será orçado',
      'Anotar materiais necessários', 'Combinar próximos passos com o cliente'
    ]
    else array[
      'Conferir EPIs e ferramentas', 'Isolar e sinalizar a área', 'Executar o serviço',
      'Testar o funcionamento', 'Limpar o local', 'Mostrar o resultado ao cliente'
    ]
  end;
$$;

-- Tira vazios e confere os limites. Lista nula continua nula: significa "usar o modelo".
create or replace function public.clean_checklist_labels(p_labels text[])
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_clean text[];
begin
  if p_labels is null then
    return null;
  end if;
  select coalesce(array_agg(trim(label) order by ord), '{}') into v_clean
  from unnest(p_labels) with ordinality as item(label, ord)
  where trim(coalesce(label, '')) <> '';
  if coalesce(array_length(v_clean, 1), 0) > 30 then
    raise exception 'Use até 30 itens no checklist.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_clean) as item(label) where length(label) > 120) then
    raise exception 'Use até 120 caracteres em cada item.' using errcode = 'P0001';
  end if;
  return v_clean;
end;
$$;

create or replace function public.list_checklist_templates(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Sem permissão para ver os checklists' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'assessment', to_jsonb(coalesce(
      (select labels from public.checklist_templates
       where company_id = p_company_id and kind = 'assessment' and deleted_at is null),
      public.default_checklist_labels('assessment'))),
    'execution', to_jsonb(coalesce(
      (select labels from public.checklist_templates
       where company_id = p_company_id and kind = 'execution' and deleted_at is null),
      public.default_checklist_labels('execution')))
  );
end;
$$;

create or replace function public.save_checklist_template(p_company_id uuid, p_kind text, p_labels text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Sem permissão para alterar os checklists' using errcode = '42501';
  end if;
  if p_kind not in ('assessment', 'execution') then
    raise exception 'Tipo de visita inválido.' using errcode = 'P0001';
  end if;
  insert into public.checklist_templates (company_id, kind, labels)
  values (p_company_id, p_kind, public.clean_checklist_labels(coalesce(p_labels, '{}')))
  on conflict (company_id, kind) do update set labels = excluded.labels, deleted_at = null;
end;
$$;

-- Em campo só se acrescenta: quem está escalado não tira o que o escritório definiu.
create or replace function public.add_work_order_checklist_item(p_company_id uuid, p_visit_id uuid, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
  v_label text := trim(coalesce(p_label, ''));
  v_next integer;
begin
  v_order := public.lock_my_open_work_order(p_company_id, p_visit_id);
  if v_label = '' then
    raise exception 'Escreva o item do checklist.' using errcode = 'P0001';
  end if;
  if length(v_label) > 120 then
    raise exception 'Use até 120 caracteres em cada item.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_order.checklist) >= 50 then
    raise exception 'Este checklist já tem o máximo de itens.' using errcode = 'P0001';
  end if;
  select coalesce(max((item ->> 'id')::integer), 0) + 1 into v_next
  from jsonb_array_elements(v_order.checklist) as list(item);
  update public.work_orders
  set checklist = checklist || jsonb_build_array(jsonb_build_object('id', v_next::text, 'label', v_label, 'done', false))
  where id = v_order.id;
end;
$$;

create or replace function public.start_work_order(p_company_id uuid, p_visit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit public.visits;
  v_id uuid;
  v_labels text[];
begin
  select * into v_visit from public.visits
  where id = p_visit_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found or not public.is_my_visit(p_visit_id) then
    raise exception 'Visita não encontrada.' using errcode = 'P0001';
  end if;

  select id into v_id from public.work_orders where visit_id = p_visit_id;
  if v_id is not null then
    return v_id;
  end if;

  if v_visit.status not in ('scheduled', 'in_progress') then
    raise exception 'Esta visita já foi encerrada.' using errcode = 'P0001';
  end if;

  -- O ajuste do atendimento vale sobre o modelo da empresa, que vale sobre o padrão.
  v_labels := coalesce(
    v_visit.checklist_labels,
    (select labels from public.checklist_templates
     where company_id = p_company_id and kind = v_visit.kind and deleted_at is null),
    public.default_checklist_labels(v_visit.kind)
  );

  insert into public.work_orders (company_id, visit_id, checklist, started_time, started_by)
  values (
    p_company_id,
    p_visit_id,
    (select coalesce(jsonb_agg(jsonb_build_object('id', ord::text, 'label', label, 'done', false) order by ord), '[]'::jsonb)
     from unnest(v_labels) with ordinality as item(label, ord)),
    public.company_now_time(p_company_id),
    auth.uid()
  )
  returning id into v_id;

  update public.visits set status = 'in_progress' where id = p_visit_id and status = 'scheduled';
  return v_id;
end;
$$;

drop function public.save_visit(uuid, uuid, uuid, uuid, uuid, text, date, time, time, text, text, uuid[]);

CREATE OR REPLACE FUNCTION public.save_visit(p_company_id uuid, p_visit_id uuid, p_client_id uuid, p_location_id uuid, p_quote_id uuid, p_kind text, p_visit_date date, p_starts_at time without time zone, p_ends_at time without time zone, p_status text, p_notes text, p_employee_ids uuid[], p_checklist text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_visit_id uuid := p_visit_id;
  v_previous uuid[] := '{}';
  v_blocks boolean := p_status in ('scheduled', 'in_progress');
  v_range tsrange;
  v_conflict text;
  v_checklist text[] := public.clean_checklist_labels(p_checklist);
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para alterar a agenda' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'Escolha o cliente.' using errcode = 'P0001';
  end if;
  if p_location_id is null then
    raise exception 'Escolha o local da visita.' using errcode = 'P0001';
  end if;
  if p_visit_date is null then
    raise exception 'Informe a data.' using errcode = 'P0001';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'O horário de término precisa ser depois do início.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_employee_ids, 1), 0) = 0 then
    raise exception 'Escolha ao menos uma pessoa da equipe.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.client_locations
    where id = p_location_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null
  ) then
    raise exception 'O local não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if p_quote_id is not null and not exists (
    select 1 from public.quotes
    where id = p_quote_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null
  ) then
    raise exception 'O orçamento não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if v_visit_id is not null then
    perform 1 from public.visits
    where id = v_visit_id and company_id = p_company_id and deleted_at is null
    for update;
    if not found then
      raise exception 'Visita não encontrada.' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(employee_id), '{}') into v_previous
    from public.visit_employees where visit_id = v_visit_id;
  end if;

  -- Quem já estava na visita pode ter sido desativado depois; quem entra agora precisa estar ativo.
  if exists (
    select 1 from unnest(p_employee_ids) as chosen(id)
    left join public.employees e
      on e.id = chosen.id and e.company_id = p_company_id and e.deleted_at is null
    where e.id is null or (not e.active and not chosen.id = any (v_previous))
  ) then
    raise exception 'Escolha apenas pessoas ativas da equipe.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.employees where id = any (p_employee_ids) and active
  ) then
    raise exception 'Escolha ao menos uma pessoa ativa da equipe.' using errcode = 'P0001';
  end if;

  v_range := tsrange(p_visit_date + p_starts_at, p_visit_date + p_ends_at, '[)');

  -- Mensagem com o nome de quem conflita; a restrição EXCLUDE segura o caso concorrente.
  if v_blocks then
    select e.name into v_conflict
    from public.visit_employees ve
    join public.employees e on e.id = ve.employee_id
    where ve.company_id = p_company_id
      and ve.employee_id = any (p_employee_ids)
      and ve.blocks_schedule
      and ve.time_range && v_range
      and ve.visit_id is distinct from v_visit_id
    limit 1;
    if v_conflict is not null then
      raise exception '% já está em outra visita nesse horário.', v_conflict using errcode = 'P0001';
    end if;
  end if;

  begin
    if v_visit_id is null then
      insert into public.visits (
        company_id, client_id, location_id, quote_id, kind, visit_date,
        starts_at, ends_at, status, notes, created_by, checklist_labels
      )
      values (
        p_company_id, p_client_id, p_location_id, p_quote_id, p_kind, p_visit_date,
        p_starts_at, p_ends_at, p_status, nullif(trim(p_notes), ''), auth.uid(), v_checklist
      )
      returning id into v_visit_id;
    else
      -- Tira os que saíram antes de mudar o horário, para não conflitar à toa.
      delete from public.visit_employees
      where visit_id = v_visit_id and not employee_id = any (p_employee_ids);

      update public.visits
      set client_id = p_client_id,
          location_id = p_location_id,
          quote_id = p_quote_id,
          kind = p_kind,
          visit_date = p_visit_date,
          starts_at = p_starts_at,
          ends_at = p_ends_at,
          status = p_status,
          notes = nullif(trim(p_notes), ''),
          checklist_labels = v_checklist
      where id = v_visit_id;
    end if;

    insert into public.visit_employees (company_id, visit_id, employee_id, time_range, blocks_schedule)
    select p_company_id, v_visit_id, chosen.id, v_range, v_blocks
    from unnest(p_employee_ids) as chosen(id)
    on conflict (visit_id, employee_id) do nothing;
  exception when exclusion_violation then
    raise exception 'Alguém da equipe acabou de ser escalado em outra visita nesse horário. Revise e tente de novo.' using errcode = 'P0001';
  end;

  return v_visit_id;
end;
$function$;

revoke execute on function
  public.list_checklist_templates(uuid),
  public.save_checklist_template(uuid, text, text[]),
  public.add_work_order_checklist_item(uuid, uuid, text),
  public.save_visit(uuid, uuid, uuid, uuid, uuid, text, date, time, time, text, text, uuid[], text[])
from public, anon;

grant execute on function
  public.list_checklist_templates(uuid),
  public.save_checklist_template(uuid, text, text[]),
  public.add_work_order_checklist_item(uuid, uuid, text),
  public.save_visit(uuid, uuid, uuid, uuid, uuid, text, date, time, time, text, text, uuid[], text[])
to authenticated;
