-- Oferta com dois planos: Anual, em destaque, e Mensal, um pouco mais caro. Os dois têm os mesmos
-- recursos. Preço e membro extra do Anual valem por ano. Quem já assina mantém o preço contratado.
update public.plans
set name = 'Mensal',
    price_cents = 37990,
    extra_seat_price_cents = 1990,
    features = '{"max_members": 10, "max_clients": null, "max_quotes_month": null, "public_approval": true, "work_orders": true, "hours": true}'
where code = 'pro';

insert into public.plans (code, name, price_cents, billing_interval, extra_seat_price_cents, features)
values (
  'anual',
  'Anual',
  395880,
  'year',
  23880,
  '{"max_members": 10, "max_clients": null, "max_quotes_month": null, "public_approval": true, "work_orders": true, "hours": true}'
);

-- Sai da oferta. Quem já assina continua nele.
update public.plans set is_active = false where code = 'enterprise';
