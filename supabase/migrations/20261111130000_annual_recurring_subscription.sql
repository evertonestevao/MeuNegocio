-- Assinatura anual recorrente (cobrada em 12 parcelas mensais, com renovação
-- automática). Campos neutros de provedor para suportar múltiplos gateways.
--
-- gateway_provider: qual gateway criou a assinatura ("asaas", "stripe"...).
--   Permite manter clientes antigos em um provedor e novos em outro.
-- payment_method_token: token do cartão devolvido pelo gateway (creditCardToken
--   no Asaas), usado para recriar a assinatura na renovação sem o cliente
--   digitar o cartão de novo. Nunca é dado sensível do cartão — só um token.
alter table public.subscriptions
  add column if not exists gateway_provider text,
  add column if not exists payment_method_token text;

comment on column public.subscriptions.gateway_provider is
  'Gateway que criou a assinatura (asaas, stripe...). Suporte a multigateway.';
comment on column public.subscriptions.payment_method_token is
  'Token do meio de pagamento no gateway (ex.: creditCardToken do Asaas) para renovar sem nova entrada de cartão. Nunca guarda dados do cartão.';

-- As policies de RLS da tabela subscriptions já cobrem as novas colunas:
-- escrita só por service_role (webhook/cancelamento), leitura pelo tenant.
-- Nenhuma policy nova é necessária.
