# Checklist de produção

Passos que **não** são código e precisam ser feitos (ou conferidos) na hora de publicar em produção. Vieram do teste de invasão (07/11/2026) e das pendências de infraestrutura. Cada item diz o porquê.

> O código já traz as travas que dependem dele (ver commits P-01, P-02, P-06, P-07). Este checklist é o que o ambiente precisa ter por cima.

## Pagamento (fecha o P-01)

- [ ] `PAYMENT_GATEWAY` = `asaas` (ou `stripe`), **nunca `fake`**. Com `APP_ENV=production`, o app recusa subir com `fake` — mas confirme o valor certo.
- [ ] `APP_ENV=production` definido no ambiente. É o que liga a trava do gateway fake.
- [ ] Asaas: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (o mesmo configurado no painel do Asaas) e `ASAAS_ENVIRONMENT=production` só depois de validar no sandbox.
- [ ] Webhook do gateway apontando para `https://<dominio>/api/webhooks/asaas` (ou `/stripe`), com o token/segredo conferido.
- [ ] Enquanto o ambiente ainda estiver com `fake` exposto num túnel, **bloquear `/api/webhooks/*`** na borda (Cloudflare) ou tirar o túnel do ar. Um webhook forjado no `fake` ativa ou cancela assinatura.

## Cadastro e limites (P-03 / P-05 — depende de código ainda não feito)

- [ ] **Antes** de desligar o cadastro aberto do Supabase, concluir o ajuste de código P-03 (o aceite de convite em `/signup` ainda usa `auth.signUp` anônimo; precisa passar a criar a conta pelo servidor com `admin.createUser`). Sem isso, desligar quebra o aceite de convite.
- [ ] No painel do Supabase de produção: `Authentication → Sign-ups` **desligado** (equivalente a `enable_signup=false`). O fluxo `/comecar` já cria conta pelo servidor e não depende disso.
- [ ] `SIGNUP_ENABLED` conforme a estratégia (fechado por padrão; aberto só se o cadastro público for intencional).
- [ ] Decidir a regra de teste grátis (P-05): hoje é por empresa, e criar empresa não tem limite. Avaliar limite por CNPJ/dono e teto de empresas por usuário.

## Rate limit (P-04)

- [ ] `RATE_LIMIT_STORE=redis` com `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. Em memória, com mais de uma instância, cada uma conta separado e o limite quase não vale.
- [ ] Avaliar um limite de login **por IP** além do atual por e-mail (o por e-mail não freia tentativa espalhada por muitas contas).

## Cabeçalhos (P-06)

- [ ] `X-Powered-By` já removido no código (`poweredByHeader: false`). Conferir no response de produção.
- [ ] **Content-Security-Policy**: implementar com nonce no `proxy.ts` (App Router injeta scripts inline), começando em `Content-Security-Policy-Report-Only` e verificando no navegador antes de aplicar de verdade. Não entrou no código ainda por exigir essa verificação.

## Autenticação (P-09)

- [ ] No painel do Supabase de produção: senha mínima maior (ex.: 8) e exigência de composição. O `config.toml` local usa 6.

## Supabase / banco

- [ ] Todas as migrations de `supabase/migrations` aplicadas no projeto de produção (`supabase db push` ou pipeline) — nunca editar schema pelo painel.
- [ ] Rodar a suíte de RLS (`supabase/tests/*.sql`) contra um banco espelho antes de liberar.
- [ ] Buckets (`company-logos`, `work-orders`, `quote-signatures`, `avatars`) com os mesmos limites de tipo/tamanho e políticas do ambiente local.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` só no servidor (nunca em var `NEXT_PUBLIC_*`).

## E-mail e termos (pendências de lote 4)

- [ ] `EMAIL_PROVIDER=resend` com `RESEND_API_KEY` e `EMAIL_FROM` de domínio verificado (ou SMTP).
- [ ] Texto real dos Termos e da Privacidade e dados legais da empresa (razão social, CNPJ) revisados.
- [ ] Teste real de envio (convite, recuperação de senha) e um teste real de telefone/WhatsApp.

## Hospedagem

- [ ] Banco e app de produção definidos (não o mini PC); `APP_URL` e `STORAGE_PUBLIC_ORIGIN` no domínio real.
- [ ] HTTPS ponta a ponta e HSTS já enviado pelo app conferidos na borda.
