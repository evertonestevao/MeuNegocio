-- Importação de clientes de uma planilha: tudo ou nada, numa transação. Roda com os direitos de
-- quem chama (security invoker): valem as policies de clientes, contatos e locais e a trava de
-- limite de clientes do plano, como no cadastro um a um.
-- p_rows: [{ name, document, notes, contact: { name, phone, email } | null, location: { name, address } | null }]

create or replace function public.import_clients(p_company_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_client_id uuid;
  v_count integer := 0;
begin
  if not public.is_company_office(p_company_id) then
    raise exception 'Sem permissão para cadastrar clientes' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Importe de 1 a 1000 clientes por vez.' using errcode = 'P0001';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if length(trim(coalesce(v_row ->> 'name', ''))) < 2 then
      raise exception 'Todo cliente precisa de nome.' using errcode = 'P0001';
    end if;

    insert into public.clients (company_id, name, document, notes)
    values (p_company_id, trim(v_row ->> 'name'), nullif(trim(v_row ->> 'document'), ''), nullif(trim(v_row ->> 'notes'), ''))
    returning id into v_client_id;

    if jsonb_typeof(v_row -> 'contact') = 'object' then
      insert into public.client_contacts (company_id, client_id, name, phone, email, is_primary)
      values (
        p_company_id, v_client_id, trim(v_row -> 'contact' ->> 'name'),
        nullif(trim(v_row -> 'contact' ->> 'phone'), ''), nullif(trim(v_row -> 'contact' ->> 'email'), ''), true
      );
    end if;

    if jsonb_typeof(v_row -> 'location') = 'object' then
      insert into public.client_locations (company_id, client_id, name, address)
      values (p_company_id, v_client_id, trim(v_row -> 'location' ->> 'name'), trim(v_row -> 'location' ->> 'address'));
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.import_clients(uuid, jsonb) from public, anon;
grant execute on function public.import_clients(uuid, jsonb) to authenticated;
