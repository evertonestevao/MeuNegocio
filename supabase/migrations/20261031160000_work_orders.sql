-- Ordem de serviço, preenchida no celular pelo técnico escalado. O escritório só lê. Toda
-- escrita passa pelas funções abaixo; depois de concluída, a OS não muda mais.
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  visit_id uuid not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  checklist jsonb not null default '[]'::jsonb,
  report text,
  -- Hora local da empresa, no dia da visita.
  started_time time not null,
  finished_time time,
  signature_path text,
  signature_name text,
  signed_at timestamptz,
  started_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id),
  unique (company_id, id),
  foreign key (company_id, visit_id) references public.visits (company_id, id) on delete cascade,
  check (status <> 'completed' or (
    finished_time > started_time and signature_path is not null and signature_name is not null and signed_at is not null
  ))
);

create index work_orders_company_idx on public.work_orders (company_id, status) where deleted_at is null;

create table public.work_order_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  work_order_id uuid not null,
  storage_path text not null,
  caption text check (length(caption) <= 200),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, work_order_id) references public.work_orders (company_id, id) on delete cascade
);

create index work_order_photos_order_idx on public.work_order_photos (company_id, work_order_id) where deleted_at is null;

create trigger set_work_orders_updated_at
  before update on public.work_orders
  for each row execute function public.set_updated_at();

alter table public.work_orders enable row level security;
alter table public.work_order_photos enable row level security;
revoke all on public.work_orders, public.work_order_photos from anon, authenticated;
grant select on public.work_orders, public.work_order_photos to authenticated;

create policy "work_orders_select" on public.work_orders
  for select to authenticated
  using (deleted_at is null and (public.is_company_office(company_id) or public.is_my_visit(visit_id)));

create policy "work_order_photos_select" on public.work_order_photos
  for select to authenticated
  using (
    deleted_at is null and (
      public.is_company_office(company_id)
      or exists (
        select 1 from public.work_orders w
        where w.id = work_order_id and public.is_my_visit(w.visit_id)
      )
    )
  );

-- Visita com OS concluída não volta atrás nem é apagada: o registro assinado precisa ficar.
create or replace function public.guard_completed_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status <> 'completed' or new.deleted_at is not null)
     and exists (select 1 from public.work_orders where visit_id = new.id and status = 'completed') then
    raise exception 'Esta visita tem ordem de serviço assinada e não pode ser reaberta nem excluída.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_completed_visit() from public, anon, authenticated;

create trigger guard_completed_visit
  before update of status, deleted_at on public.visits
  for each row execute function public.guard_completed_visit();

-- Hora local agora, no fuso da empresa.
create or replace function public.company_now_time(p_company_id uuid)
returns time
language sql
security definer
set search_path = public
stable
as $$
  select date_trunc('minute', now() at time zone coalesce(
    (select timezone from public.company_profiles where company_id = p_company_id),
    'America/Sao_Paulo'
  ))::time;
$$;

revoke execute on function public.company_now_time(uuid) from public, anon, authenticated;

-- Dados da visita para quem vai a campo: só o necessário, sem documento nem observações do
-- cliente. O técnico não lê as tabelas de clientes, e estas funções são a única porta dele.
create or replace function public.visit_sheet_json(p_visit public.visits)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', p_visit.id,
    'company_id', p_visit.company_id,
    'kind', p_visit.kind,
    'visit_date', p_visit.visit_date,
    'starts_at', p_visit.starts_at,
    'ends_at', p_visit.ends_at,
    'status', p_visit.status,
    'notes', p_visit.notes,
    'is_mine', public.is_my_visit(p_visit.id),
    'client_name', c.name,
    'location', jsonb_build_object('name', l.name, 'address', l.address, 'notes', l.notes),
    'contact', (
      select jsonb_build_object('name', ct.name, 'role', ct.role, 'phone', ct.phone)
      from public.client_contacts ct
      where ct.client_id = p_visit.client_id and ct.deleted_at is null
      order by ct.is_primary desc, ct.created_at
      limit 1
    ),
    'team', coalesce((
      select jsonb_agg(e.name order by e.name)
      from public.visit_employees ve
      join public.employees e on e.id = ve.employee_id
      where ve.visit_id = p_visit.id
    ), '[]'::jsonb),
    'work_order', (
      select jsonb_build_object(
        'id', w.id,
        'status', w.status,
        'checklist', w.checklist,
        'report', w.report,
        'started_time', w.started_time,
        'finished_time', w.finished_time,
        'signature_path', w.signature_path,
        'signature_name', w.signature_name,
        'signed_at', w.signed_at,
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path, 'caption', ph.caption) order by ph.created_at)
          from public.work_order_photos ph
          where ph.work_order_id = w.id and ph.deleted_at is null
        ), '[]'::jsonb)
      )
      from public.work_orders w
      where w.visit_id = p_visit.id and w.deleted_at is null
    )
  )
  from public.clients c
  join public.client_locations l on l.id = p_visit.location_id
  where c.id = p_visit.client_id;
$$;

revoke execute on function public.visit_sheet_json(public.visits) from public, anon, authenticated;

create or replace function public.get_visit_sheet(p_company_id uuid, p_visit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_visit public.visits;
begin
  select * into v_visit from public.visits
  where id = p_visit_id and company_id = p_company_id and deleted_at is null;
  if not found or not (public.is_company_office(p_company_id) or public.is_my_visit(p_visit_id)) then
    return null;
  end if;
  return public.visit_sheet_json(v_visit);
end;
$$;

-- Visitas do usuário logado, no período.
create or replace function public.list_my_visits(p_company_id uuid, p_from date, p_to date)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(public.visit_sheet_json(v) order by v.visit_date, v.starts_at), '[]'::jsonb)
  from public.visits v
  where v.company_id = p_company_id
    and v.deleted_at is null
    and v.visit_date between p_from and p_to
    and public.is_my_visit(v.id);
$$;

-- "Cheguei": a visita fica em andamento e a OS nasce com o checklist do tipo da visita.
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

  v_labels := case v_visit.kind
    when 'assessment' then array[
      'Conferir local e acesso', 'Medir e fotografar o que será orçado',
      'Anotar materiais necessários', 'Combinar próximos passos com o cliente'
    ]
    else array[
      'Conferir EPIs e ferramentas', 'Isolar e sinalizar a área', 'Executar o serviço',
      'Testar o funcionamento', 'Limpar o local', 'Mostrar o resultado ao cliente'
    ]
  end;

  insert into public.work_orders (company_id, visit_id, checklist, started_time, started_by)
  values (
    p_company_id,
    p_visit_id,
    (select jsonb_agg(jsonb_build_object('id', ord::text, 'label', label, 'done', false) order by ord)
     from unnest(v_labels) with ordinality as item(label, ord)),
    public.company_now_time(p_company_id),
    auth.uid()
  )
  returning id into v_id;

  update public.visits set status = 'in_progress' where id = p_visit_id and status = 'scheduled';
  return v_id;
end;
$$;

-- OS aberta do usuário logado, travada para a escrita. Levanta erro em qualquer outro caso.
create or replace function public.lock_my_open_work_order(p_company_id uuid, p_visit_id uuid)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
  v_status text;
begin
  select * into v_order from public.work_orders
  where visit_id = p_visit_id and company_id = p_company_id and deleted_at is null
  for update;
  if not public.is_my_visit(p_visit_id) then
    raise exception 'Visita não encontrada.' using errcode = 'P0001';
  end if;
  if v_order.id is null then
    raise exception 'Inicie a ordem de serviço antes de continuar.' using errcode = 'P0001';
  end if;
  if v_order.status = 'completed' then
    raise exception 'A ordem de serviço já foi concluída e assinada.' using errcode = 'P0001';
  end if;
  select status into v_status from public.visits where id = p_visit_id and deleted_at is null;
  if v_status is distinct from 'in_progress' then
    raise exception 'Esta visita já foi encerrada.' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;

revoke execute on function public.lock_my_open_work_order(uuid, uuid) from public, anon, authenticated;

create or replace function public.save_work_order(
  p_company_id uuid,
  p_visit_id uuid,
  p_done_ids text[],
  p_report text,
  p_started_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
begin
  v_order := public.lock_my_open_work_order(p_company_id, p_visit_id);
  update public.work_orders
  set checklist = (
        select coalesce(jsonb_agg(item || jsonb_build_object('done', (item ->> 'id') = any (coalesce(p_done_ids, '{}'))) order by ord), '[]'::jsonb)
        from jsonb_array_elements(v_order.checklist) with ordinality as list(item, ord)
      ),
      report = nullif(trim(p_report), ''),
      started_time = coalesce(p_started_time, started_time)
  where id = v_order.id;
end;
$$;

create or replace function public.add_work_order_photo(
  p_company_id uuid,
  p_visit_id uuid,
  p_path text,
  p_caption text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
  v_id uuid;
begin
  v_order := public.lock_my_open_work_order(p_company_id, p_visit_id);
  if split_part(p_path, '/', 1) <> p_company_id::text or split_part(p_path, '/', 2) <> v_order.id::text then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.work_order_photos where work_order_id = v_order.id and deleted_at is null) >= 30 then
    raise exception 'Esta ordem de serviço já tem 30 fotos. Exclua alguma antes de continuar.' using errcode = 'P0001';
  end if;
  insert into public.work_order_photos (company_id, work_order_id, storage_path, caption)
  values (p_company_id, v_order.id, p_path, nullif(trim(p_caption), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Devolve o caminho, para o servidor apagar o arquivo.
create or replace function public.remove_work_order_photo(p_company_id uuid, p_visit_id uuid, p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
  v_path text;
begin
  v_order := public.lock_my_open_work_order(p_company_id, p_visit_id);
  update public.work_order_photos
  set deleted_at = now()
  where id = p_photo_id and work_order_id = v_order.id and deleted_at is null
  returning storage_path into v_path;
  if v_path is null then
    raise exception 'Foto não encontrada.' using errcode = 'P0001';
  end if;
  return v_path;
end;
$$;

create or replace function public.complete_work_order(
  p_company_id uuid,
  p_visit_id uuid,
  p_signature_path text,
  p_signature_name text,
  p_finished_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
begin
  v_order := public.lock_my_open_work_order(p_company_id, p_visit_id);
  if p_signature_path is null then
    raise exception 'Peça a assinatura do cliente.' using errcode = 'P0001';
  end if;
  if split_part(p_signature_path, '/', 1) <> p_company_id::text or split_part(p_signature_path, '/', 2) <> v_order.id::text then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_signature_name, ''))) < 2 then
    raise exception 'Informe o nome de quem assinou.' using errcode = 'P0001';
  end if;
  if p_finished_time is null or p_finished_time <= v_order.started_time then
    raise exception 'O horário de término precisa ser depois do início.' using errcode = 'P0001';
  end if;

  update public.work_orders
  set status = 'completed',
      finished_time = p_finished_time,
      signature_path = p_signature_path,
      signature_name = trim(p_signature_name),
      signed_at = now()
  where id = v_order.id;

  update public.visits set status = 'completed' where id = p_visit_id;
end;
$$;

revoke execute on function
  public.get_visit_sheet(uuid, uuid),
  public.list_my_visits(uuid, date, date),
  public.start_work_order(uuid, uuid),
  public.save_work_order(uuid, uuid, text[], text, time),
  public.add_work_order_photo(uuid, uuid, text, text),
  public.remove_work_order_photo(uuid, uuid, uuid),
  public.complete_work_order(uuid, uuid, text, text, time)
from public, anon;

grant execute on function
  public.get_visit_sheet(uuid, uuid),
  public.list_my_visits(uuid, date, date),
  public.start_work_order(uuid, uuid),
  public.save_work_order(uuid, uuid, text[], text, time),
  public.add_work_order_photo(uuid, uuid, text, text),
  public.remove_work_order_photo(uuid, uuid, uuid),
  public.complete_work_order(uuid, uuid, text, text, time)
to authenticated;

-- Fotos e assinaturas: bucket privado. Caminho: <company_id>/<work_order_id>/<arquivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-orders', 'work-orders', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_read_work_order_file(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.work_orders w
    where w.company_id::text = split_part(p_name, '/', 1)
      and w.id::text = split_part(p_name, '/', 2)
      and w.deleted_at is null
      and (public.is_company_office(w.company_id) or public.is_my_visit(w.visit_id))
  );
$$;

create or replace function public.can_write_work_order_file(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.work_orders w
    where w.company_id::text = split_part(p_name, '/', 1)
      and w.id::text = split_part(p_name, '/', 2)
      and w.deleted_at is null
      and w.status = 'in_progress'
      and public.is_my_visit(w.visit_id)
  );
$$;

revoke execute on function public.can_read_work_order_file(text), public.can_write_work_order_file(text) from public, anon;
grant execute on function public.can_read_work_order_file(text), public.can_write_work_order_file(text) to authenticated;

create policy "work_order_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'work-orders' and public.can_read_work_order_file(name));

create policy "work_order_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'work-orders' and public.can_write_work_order_file(name));

create policy "work_order_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'work-orders' and public.can_write_work_order_file(name));
