-- Assinatura do cliente ao aprovar pelo link, como na conclusão da ordem de serviço. O arquivo fica
-- em bucket privado, gravado só pelo servidor (o cliente não tem login); o escritório lê por link
-- temporário. Caminho: <company_id>/<quote_id>/<arquivo>.png

alter table public.quote_responses
  add column signature_path text check (signature_path is null or length(signature_path) between 1 and 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-signatures', 'quote-signatures', false, 1048576, array['image/png'])
on conflict (id) do nothing;

create or replace function public.can_read_quote_signature(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.quotes q
    where q.company_id::text = split_part(p_name, '/', 1)
      and q.id::text = split_part(p_name, '/', 2)
      and q.deleted_at is null
      and public.is_company_office(q.company_id)
  );
$$;

revoke execute on function public.can_read_quote_signature(text) from public, anon;
grant execute on function public.can_read_quote_signature(text) to authenticated;

-- Só leitura: a gravação é do servidor, com service_role, depois de conferir o token do link.
create policy "quote_signatures_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-signatures' and public.can_read_quote_signature(name));

drop function public.respond_public_quote(text, text, text, text);

create function public.respond_public_quote(p_token text, p_decision text, p_name text, p_comment text, p_signature_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  if p_decision not in ('approved', 'refused') then
    raise exception 'Resposta inválida.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if p_decision = 'refused' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Conte o motivo da recusa.' using errcode = 'P0001';
  end if;

  select * into v_quote from public.quotes
  where public_token = p_token and deleted_at is null
  for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Este orçamento não aceita mais respostas.' using errcode = 'P0001';
  end if;
  if v_quote.valid_until < public.company_today(v_quote.company_id) then
    raise exception 'A validade deste orçamento terminou. Fale com a empresa.' using errcode = 'P0001';
  end if;
  -- Aprovar exige assinatura, guardada na pasta deste orçamento.
  if p_decision = 'approved' and (
    p_signature_path is null or p_signature_path not like v_quote.company_id::text || '/' || v_quote.id::text || '/%'
  ) then
    raise exception 'Assine para aprovar o orçamento.' using errcode = 'P0001';
  end if;

  insert into public.quote_responses (company_id, quote_id, decision, name, comment, signature_path)
  values (
    v_quote.company_id, v_quote.id, p_decision, trim(p_name), nullif(trim(p_comment), ''),
    case when p_decision = 'approved' then p_signature_path end
  );

  if p_decision = 'approved' then
    update public.quotes set status = 'approved', approved_at = now() where id = v_quote.id;
  else
    update public.quotes set status = 'refused', refused_at = now() where id = v_quote.id;
  end if;

  return jsonb_build_object('company_id', v_quote.company_id, 'quote_id', v_quote.id);
end;
$$;

revoke execute on function public.respond_public_quote(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.respond_public_quote(text, text, text, text, text) to service_role;
