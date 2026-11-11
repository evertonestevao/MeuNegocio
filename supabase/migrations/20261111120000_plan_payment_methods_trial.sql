-- Plano ganha: meios de pagamento aceitos (padrão só cartão) e dias de teste grátis (padrão 7).
-- O checkout usa os meios aceitos; os dias de teste serão ligados ao adiamento da 1ª cobrança
-- numa etapa seguinte (depende de validação no gateway).

alter table public.plans
  add column if not exists payment_methods text[] not null default array['credit_card']::text[],
  add column if not exists trial_days integer not null default 7;

alter table public.plans
  drop constraint if exists plans_payment_methods_valid,
  add constraint plans_payment_methods_valid
    check (cardinality(payment_methods) >= 1 and payment_methods <@ array['credit_card','pix','boleto']::text[]);

alter table public.plans
  drop constraint if exists plans_trial_days_range,
  add constraint plans_trial_days_range check (trial_days >= 0 and trial_days <= 90);

-- admin_save_plan passa a gravar os dois campos. Recriada com a nova assinatura.
drop function if exists public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, uuid);

create function public.admin_save_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_price_cents integer,
  p_extra_seat_price_cents integer,
  p_features jsonb,
  p_custom_text text,
  p_payment_methods text[],
  p_trial_days integer,
  p_actor uuid
) returns public.plans
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old public.plans;
  v_new public.plans;
begin
  if p_plan_id is null then
    insert into public.plans (code, name, price_cents, extra_seat_price_cents, features, custom_text, payment_methods, trial_days)
    values (p_code, p_name, p_price_cents, p_extra_seat_price_cents, p_features, p_custom_text, p_payment_methods, p_trial_days)
    returning * into v_new;

    insert into public.plan_audit_log (plan_id, action, changed_by, new_values)
    values (v_new.id, 'created', p_actor, to_jsonb(v_new));
    return v_new;
  end if;

  select * into v_old from public.plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  -- code não muda depois de criado: o gateway e as checagens dependem dele.
  update public.plans
  set name = p_name,
      price_cents = p_price_cents,
      extra_seat_price_cents = p_extra_seat_price_cents,
      features = p_features,
      custom_text = p_custom_text,
      payment_methods = p_payment_methods,
      trial_days = p_trial_days
  where id = p_plan_id
  returning * into v_new;

  insert into public.plan_audit_log (plan_id, action, changed_by, old_values, new_values)
  values (v_new.id, 'updated', p_actor, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

grant execute on function public.admin_save_plan(uuid, text, text, integer, integer, jsonb, text, text[], integer, uuid) to service_role;
