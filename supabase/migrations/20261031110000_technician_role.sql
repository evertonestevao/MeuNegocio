-- Papel de campo: vê só as próprias visitas e preenche as próprias ordens de serviço.
insert into public.roles (code, name, description) values
  ('technician', 'Técnico', 'Equipe de campo. Vê só as próprias visitas e ordens de serviço.');

-- Escritório: quem acessa os cadastros. is_company_member inclui o técnico, então as
-- tabelas de negócio usam esta função para deixá-lo de fora.
create or replace function public.is_company_office(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and cm.role in ('owner', 'admin', 'member')
  );
$$;

revoke execute on function public.is_company_office(uuid) from public, anon;
grant execute on function public.is_company_office(uuid) to authenticated;

-- Só owner e admin apagam registros. RLS não distingue colunas, então um UPDATE que mexe
-- em deleted_at passa por este gatilho. O service_role não tem auth.uid() e segue livre.
create or replace function public.guard_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is distinct from old.deleted_at
     and auth.uid() is not null
     and not public.is_company_admin(new.company_id) then
    raise exception 'Só owner e admin apagam registros' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_soft_delete() from public, anon, authenticated;
