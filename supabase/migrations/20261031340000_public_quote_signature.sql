-- O link do orçamento passa a devolver o caminho da assinatura de quem aprovou. O arquivo continua
-- privado: o servidor gera um link temporário só para a pasta deste orçamento, e só quem tem o
-- token do link vê, como o restante do documento.

CREATE OR REPLACE FUNCTION public.get_public_quote(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'company_id', q.company_id,
    'quote_id', q.id,
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'valid_until', q.valid_until,
    'is_within_validity', q.valid_until >= public.company_today(q.company_id),
    'created_at', q.created_at,
    'subtotal_cents', q.subtotal_cents,
    'discount_cents', q.discount_cents,
    'total_cents', q.total_cents,
    'notes', q.notes,
    'company', jsonb_build_object(
      'name', co.name, 'cnpj', p.cnpj, 'phone', p.phone, 'email', p.email, 'address', p.address
    ),
    'client', jsonb_build_object('name', c.name, 'document', c.document),
    'location', case when l.id is null then null
      else jsonb_build_object('name', l.name, 'address', l.address) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', i.description, 'unit', i.unit, 'pricing_mode', i.pricing_mode,
        'quantity', i.quantity, 'people', i.people,
        'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents
      ) order by i.sort_order)
      from public.quote_items i
      where i.quote_id = q.id and i.deleted_at is null
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object('decision', r.decision, 'name', r.name, 'comment', r.comment, 'created_at', r.created_at,
        'signature_path', r.signature_path)
      from public.quote_responses r
      where r.quote_id = q.id and r.deleted_at is null
      order by r.created_at desc
      limit 1
    )
  )
  from public.quotes q
  join public.companies co on co.id = q.company_id and co.deleted_at is null
  join public.clients c on c.id = q.client_id
  left join public.client_locations l on l.id = q.location_id
  left join public.company_profiles p on p.company_id = q.company_id
  where q.public_token = p_token
    and q.deleted_at is null
    and q.status <> 'draft';
$function$

;
