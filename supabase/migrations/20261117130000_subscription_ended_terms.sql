-- Termos encerrados da assinatura. Ao renovar um termo (anual em N parcelas), a assinatura passa a
-- apontar para o termo novo no gateway, e o id do termo antigo vai para esta lista. Assim, um evento
-- repetido ou atrasado do termo antigo (ex.: o PAYMENT_RECEIVED da última parcela, que no cartão
-- chega cerca de 30 dias depois do CONFIRMED) é reconhecido e ignorado. Sem isso, o serviço o trataria
-- como uma assinatura nova, criaria outra linha e a renovação dispararia de novo, cobrando em dobro.
alter table public.subscriptions
  add column if not exists ended_external_ids text[] not null default '{}';
