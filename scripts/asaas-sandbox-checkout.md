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

## 3. Conferir os webhooks (manual)

Com o webhook apontando para o ambiente (ou um coletor como webhook.site),
observe a ordem dos eventos ao concluir o checkout e na data da 1ª cobrança:

- Ao concluir o checkout: deve chegar **`CHECKOUT_PAID`**. O adapter consulta
  `GET /checkouts/{id}` para achar a assinatura criada e o `externalReference`, e
  marca a assinatura como **em teste (trialing)** até `nextDueDate`.
- Na data da 1ª cobrança: deve chegar **`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`**,
  que ativa a assinatura (vira `active`).

### O que confirmar (e ajustar se divergir)

O tratamento de `CHECKOUT_PAID` em `asaasGateway.ts` assume que:

- `GET /checkouts/{id}` retorna o **id da assinatura criada** (em `subscription`,
  string ou objeto com `id`) e o **`externalReference`** (`"<companyId>:<planId>"`).
- O `nextDueDate` vem no checkout ou na assinatura.

Se os nomes dos campos vierem diferentes no sandbox, ajuste a interface
`AsaasCheckout` e o branch de `CHECKOUT_PAID` em `normalize()`. Os testes em
`asaasGateway.test.ts` cobrem a forma esperada.

## 4. Produção

- A chave de produção e o `ASAAS_ENVIRONMENT=production` trocam a URL base.
- O domínio de `successUrl`/`cancelUrl` precisa estar cadastrado nas informações
  comerciais da conta Asaas, senão a API recusa o checkout.
