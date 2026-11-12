# Validar o teste grátis (cobrança adiada) no sandbox do Asaas

O teste com cartão usa o **Checkout hospedado** do Asaas (`POST /checkouts`) com um
bloco `subscription` e `nextDueDate` = hoje + dias de teste do plano. A primeira
cobrança deve acontecer **só na data futura** — nunca na hora. Como o Asaas não
documenta 100% o comportamento da cobrança adiada nem a sequência exata de
webhooks, confirme no sandbox antes de ligar em produção.

## 1. O corpo do checkout é aceito (automático)

Valida que o corpo que `src/adapters/payment/asaasGateway.ts` monta é aceito pela
API (sem cobrar nada):

```bash
# a chave de sandbox ($aact_hmlg_...) está no .env.local
KEY=$(grep '^ASAAS_API_KEY=' .env.local | cut -d= -f2- | sed 's/^\\//') \
  ASAAS_API_KEY="$KEY" node scripts/asaas-sandbox-checkout.mjs 15
```

Esperado: `HTTP 200` e um `link`. O `nextDueDate` impresso é a data da 1ª cobrança.

## 2. Pagar o checkout e conferir que NÃO cobra hoje (manual)

1. Abra o `link` impresso no passo 1.
2. Pague com um **cartão de teste do Asaas** (ver docs do Asaas; no sandbox,
   qualquer cartão de teste válido é aprovado).
3. No **painel do sandbox** (Cobranças / Assinaturas), confira:
   - A **assinatura** foi criada com a **próxima cobrança na data futura**
     (`nextDueDate`), não como paga hoje.
   - **Não há cobrança “recebida/confirmada” hoje.** Se aparecer uma cobrança
     paga na hora, o adiamento não funcionou — **pare e me avise**.

## 3. Webhook: eventos necessários

O webhook do Asaas **precisa ter `CHECKOUT_PAID` habilitado** (além de
`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`/`PAYMENT_OVERDUE`/refunds/cancelamentos).
Confira em `GET /webhooks`; se faltar, adicione `CHECKOUT_PAID` à lista de eventos.

Por quê: a assinatura e as cobranças criadas pelo checkout vêm **sem**
`externalReference`. O único evento que carrega o `"<companyId>:<planId>"` é o
`CHECKOUT_PAID`. O adapter:

1. Ao receber `CHECKOUT_PAID`: lê `checkout.externalReference` (empresa:plano) e
   `checkout.subscription.nextDueDate` (1ª cobrança). Como o payload **não traz o id
   da assinatura**, lista `GET /subscriptions?limit=100` e acha a assinatura pelo
   campo **`checkoutSession` = `checkout.id`**. Vencimento futuro → entra **em teste
   (trialing)**; vencimento hoje → **ativa**.
2. Na data da 1ª cobrança: chega `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`. A assinatura
   do checkout não tem `externalReference`, então o casamento é pelo **id da
   assinatura** (a linha já existe no banco desde o `CHECKOUT_PAID`): passa a `active`.

### Confirmar no sandbox (fluxo real)

Depois de concluir um checkout de teste, confira em `subscriptions` (nosso banco)
que a assinatura entrou como `trialing` com o `external_subscription_id` certo, e que
a tela `/assinar/confirmando` avançou sozinha para o passo 4.

## 4. Produção

- A chave de produção e o `ASAAS_ENVIRONMENT=production` trocam a URL base.
- O domínio de `successUrl`/`cancelUrl` precisa estar cadastrado nas informações
  comerciais da conta Asaas, senão a API recusa o checkout.
