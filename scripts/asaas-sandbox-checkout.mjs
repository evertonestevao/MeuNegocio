#!/usr/bin/env node
/**
 * Valida, contra o sandbox do Asaas, que o Checkout hospedado com assinatura e
 * `nextDueDate` futuro é aceito (mesmo corpo que src/adapters/payment/asaasGateway.ts
 * monta no mensal). NÃO cobra nada: só cria o checkout e imprime o link.
 *
 * Uso:
 *   ASAAS_API_KEY="$aact_hmlg_..." node scripts/asaas-sandbox-checkout.mjs [diasDeTeste]
 *
 * Depois, abra o `link` impresso, pague com um cartão de teste do Asaas e confira
 * no painel do sandbox que a 1ª cobrança ficou agendada para a data futura
 * (nextDueDate), e não como paga hoje. Veja scripts/asaas-sandbox-checkout.md.
 */

const apiKey = process.env.ASAAS_API_KEY;
if (!apiKey) {
  console.error("Defina ASAAS_API_KEY (chave de sandbox $aact_hmlg_...) no ambiente.");
  process.exit(1);
}

const trialDays = Number.parseInt(process.argv[2] ?? "15", 10);

function dueDateString(days) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, days));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const IMG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const body = {
  billingTypes: ["CREDIT_CARD"],
  chargeTypes: ["RECURRENT"],
  minutesToExpire: 60,
  externalReference: "sandbox-company:sandbox-plan",
  callback: {
    successUrl: "https://meunegocio.everapps.com.br/assinar/confirmando",
    cancelUrl: "https://meunegocio.everapps.com.br/assinar",
    expiredUrl: "https://meunegocio.everapps.com.br/assinar",
  },
  items: [
    { name: "Plano de teste", description: "Assinatura (sandbox)", quantity: 1, value: 99.9, imageBase64: IMG_1PX },
  ],
  subscription: { cycle: "MONTHLY", nextDueDate: dueDateString(trialDays) },
  // Sem customerData: a página do Asaas coleta os dados do comprador.
};

const res = await fetch("https://api-sandbox.asaas.com/v3/checkouts", {
  method: "POST",
  headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "starterkit-saas" },
  body: JSON.stringify(body),
});
const json = await res.json().catch(() => ({}));

console.log("HTTP", res.status);
console.log("nextDueDate (1ª cobrança):", body.subscription.nextDueDate, `(+${trialDays} dias)`);
console.log(JSON.stringify(json, null, 2));
if (!res.ok) process.exit(1);
console.log("\nAbra o link acima, pague com cartão de teste e confira no painel do sandbox.");
