# Funcionalidades do sistema

O que o MeuNegócio faz, quem pode usar cada função e quais regras se aplicam. Para setup,
arquitetura e deploy, veja [DOCUMENTACAO.md](DOCUMENTACAO.md).

> **Mantenha este arquivo atualizado.** Toda mudança que cria, altera ou remove uma
> funcionalidade atualiza a seção correspondente no mesmo commit.

**Última atualização:** 2026-11-04

## Sumário

1. [Papéis e permissões](#1-papéis-e-permissões)
2. [Conta e autenticação](#2-conta-e-autenticação)
3. [Termos de uso e consentimentos](#3-termos-de-uso-e-consentimentos)
4. [Empresas (multi-tenant)](#4-empresas-multi-tenant)
5. [Membros e convites](#5-membros-e-convites)
6. [Perfil do usuário](#6-perfil-do-usuário)
7. [Seus dados: exportação e exclusão de conta](#7-seus-dados-exportação-e-exclusão-de-conta)
8. [Planos, assinatura e billing](#8-planos-assinatura-e-billing)
9. [Feature flags](#9-feature-flags)
10. [Auditoria](#10-auditoria)
11. [Início e navegação](#11-início-e-navegação)
12. [Páginas públicas](#12-páginas-públicas)
13. [Operação: health check, erros e rate limit](#13-operação-health-check-erros-e-rate-limit)
14. [Integrações e provedores trocáveis](#14-integrações-e-provedores-trocáveis)
15. [Revendedores (em construção)](#15-revendedores-em-construção)
16. [Clientes](#16-clientes)
17. [Catálogo](#17-catálogo)
18. [Orçamentos](#18-orçamentos)
19. [Equipe](#19-equipe)
20. [Agenda](#20-agenda)
21. [Ordem de serviço](#21-ordem-de-serviço)
22. [Horas](#22-horas)
23. [Gastos](#23-gastos)
24. [Financeiro](#24-financeiro)
25. [Custos e resultado por serviço](#25-custos-e-resultado-por-serviço)
26. [Demonstração](#26-demonstração)

---

## 1. Papéis e permissões

Cada usuário tem um papel **por empresa**: a mesma pessoa pode ser owner de uma empresa e
member de outra.

| Capacidade | Owner | Admin | Member | Técnico |
|---|:-:|:-:|:-:|:-:|
| Ver dados da empresa e lista de membros | ✅ | ✅ | ✅ | ✅ |
| Ver, criar e editar clientes, contatos e locais | ✅ | ✅ | ✅ | — |
| Apagar registros de negócio | ✅ | ✅ | — | — |
| Ver o catálogo; criar, editar e enviar orçamentos | ✅ | ✅ | ✅ | — |
| Editar o catálogo e ver custo e margem | ✅ | ✅ | — | — |
| Fechar orçamento e desfazer o fechamento | ✅ | ✅ | — | — |
| Ver e alterar toda a agenda | ✅ | ✅ | ✅ | — |
| Ver nome, função e situação da equipe | ✅ | ✅ | ✅ | — |
| Cadastrar a equipe e ver contrato e pagamento | ✅ | ✅ | — | — |
| Ver as ordens de serviço | ✅ | ✅ | ✅ | Só as próprias |
| Preencher a ordem de serviço | Quem está escalado | Quem está escalado | Quem está escalado | Só as próprias |
| Horas, gastos e financeiro | ✅ | ✅ | — | — |
| Editar nome e dados da empresa | ✅ | ✅ | — | — |
| Convidar, revogar convite, mudar papel, remover membro | ✅ | ✅¹ | — | — |
| Ver auditoria | ✅ | ✅ | — | — |
| Assinar, trocar e cancelar plano | ✅ | — | — | — |
| Transferir a propriedade da empresa | ✅ | — | — | — |
| Sair da empresa | — ² | ✅ | ✅ | ✅ |

¹ Ações sobre outro membro exigem papel **acima** do papel do alvo: um admin gerencia members,
mas não outros admins nem o owner.
² O owner precisa transferir a empresa antes de sair.

- Toda regra é checada no servidor (services) **e** no banco (RLS). Esconder um botão na tela é
  só conveniência.
- Novos papéis são criados por migration (`public.roles`) mais `defineRole()` em
  `src/services/permissionService.ts`.
- **Super admin** é um papel global da plataforma, separado dos papéis por empresa: fica em
  `public.platform_admins`, que a aplicação só lê. A concessão é feita direto no banco, com
  `insert into public.platform_admins (user_id) select id from auth.users where email = '...';`.

## 2. Conta e autenticação

| Função | Como funciona | Regras |
|---|---|---|
| **Telas de acesso** | Login, cadastro e recuperação de senha têm painel com a marca no computador e cabeçalho compacto no celular. A senha pode ser exibida, e o login oferece a demonstração. | — |
| **Cadastro fechado** | Padrão (`SIGNUP_ENABLED=false`). A página inicial e o login não oferecem criar conta: "Quero contratar" abre o WhatsApp comercial (`brand.salesWhatsapp`) com a mensagem pronta, e o servidor recusa o cadastro, salvo para e-mail com convite pendente. Para abrir, `SIGNUP_ENABLED=true`. | — |
| **Cadastro** (`/signup`) | Nome completo, email e senha. Mostra links para Termos e Privacidade. | Senha com no mínimo 8 caracteres. Rate limit por email. |
| **Login** (`/login`) | Email e senha. Respeita `?next=` para voltar à página de origem. | 10 tentativas por minuto por email. |
| **Logout** | Menu do usuário, no topo do painel. | — |
| **Esqueci a senha** (`/forgot-password`) | Envia um link de redefinição por email. | Sempre responde "se o email existir…", para não revelar quais emails têm conta. Rate limit por email. |
| **Redefinir senha** (`/reset-password`) | Abre pelo link do email (fluxo PKCE via `/auth/confirm`). | Só aceita redirects para domínios permitidos. |

Rotas do painel exigem login. Usuário logado que abre `/login` ou `/signup` é redirecionado.

Código: `src/services/authService.ts`, `src/server/actions/auth.ts`, `src/proxy.ts`.

## 3. Termos de uso e consentimentos

| Função | Como funciona |
|---|---|
| **Termos versionados** | Cada versão fica em `terms_versions`; só uma é a vigente. A página pública `/terms` mostra a vigente. |
| **Aceite no onboarding** | A primeira empresa só é criada depois do aceite da versão vigente. |
| **Reaceite obrigatório** | Ao publicar uma versão nova, todo usuário é levado a `/accept-terms` antes de continuar. |
| **Evidência do aceite** | Grava data, IP e navegador de cada aceite (LGPD). Só o servidor grava, com os dados da request, e o usuário não consegue inserir nem alterar o registro. |
| **Consentimento por finalidade** | Hoje existe a finalidade `email_communications` (opcional, revogável). Cada mudança gera um registro novo, com histórico. |

Publicar termos novos: migration em produção, ou `scripts/publish-terms.sh` em desenvolvimento.

Código: `src/services/termsService.ts`, `src/server/actions/terms.ts`.

## 4. Empresas (multi-tenant)

| Função | Quem | Como funciona |
|---|---|---|
| **Criar empresa e acesso** (`/admin/empresas`) | Super admin | Cria a empresa, o proprietário e, se escolhido, libera um plano sem cobrança, pelo período dele e sem renovar. Mostra uma senha temporária uma única vez; no primeiro acesso, a pessoa precisa trocá-la. Falhou no meio, nada fica para trás. |
| **Criar empresa** (`/onboarding`) | Com o cadastro aberto, qualquer usuário logado; fechado, só o super admin | Quem cria vira owner. O slug é gerado a partir do nome (com sufixo se já existir). No primeiro acesso, pede também os dados da empresa usados nos orçamentos: CNPJ, telefone, e-mail, endereço, fuso, validade padrão e observações. Só o nome é obrigatório. Dado inválido é recusado antes de criar a empresa, sem apagar o que foi digitado. A empresa nova começa sem dados de exemplo. |
| **Várias empresas por usuário** | Todos | O seletor no topo do painel troca a **empresa ativa**. |
| **Empresa ativa** | Todos | Guardada em cookie só como preferência. A cada request o servidor confere se o usuário ainda é membro. |
| **Editar nome** (Configurações) | Owner, admin | — |
| **Transferir propriedade** (Membros › ⋯) | Owner | Escolhe um membro ativo, que vira owner. O owner antigo vira admin. A troca é atômica e auditada. |
| **Sair da empresa** (Configurações) | Admin, member | — |

Isolamento: toda tabela de negócio tem `company_id`, RLS e soft delete (`deleted_at`). Um usuário
nunca vê nem altera dados de uma empresa da qual não é membro, o que é provado por
`supabase/tests/rls_test.sql`.

Código: `src/services/tenantService.ts`, `src/server/actions/tenant.ts`, `src/server/tenant.ts`.

## 5. Membros e convites

| Função | Quem | Regras |
|---|---|---|
| **Listar membros** (`/dashboard/members`) | Owner, admin | Paginado (20 por página). Vira tabela no desktop e cards no mobile. |
| **Convidar por email** | Owner, admin | Papel admin, member ou técnico. O convite expira em 7 dias. Limite de 20 convites por hora por pessoa. |
| **Revogar convite pendente** | Owner, admin | — |
| **Aceitar convite** (`/invites/accept`) | O convidado | Pelo link do email ou em Configurações › "Convites pendentes para você". O menu mostra um badge com a contagem. |
| **Mudar papel** (entre admin, member e técnico) | Owner, admin | Hierarquia: só sobre papéis abaixo do seu. |
| **Remover membro** | Owner, admin | Soft delete. O owner nunca pode ser removido. |

Cada convite pendente reserva uma vaga (seat). Passar da franquia depende do plano: se ele vende
membro extra, o convite passa e a cobrança é recalculada (ver seção 8); se não vende, como o Free, o
convite é recusado até liberar uma vaga. Um convite já emitido também é recusado no aceite se a
empresa não tiver mais vaga, por exemplo depois de um downgrade. Ninguém é removido por isso.

Essas regras também valem no banco, para quem chama a API direto: entrar na empresa só por convite,
ação sobre outro membro só com papel acima do dele, e o papel owner muda apenas por transferência.
Convite não pode ser para owner e, depois de criado, só pode ser revogado.

Código: `src/services/inviteService.ts`, `src/services/tenantService.ts`.

## 6. Perfil do usuário

| Função | Regras |
|---|---|
| **Editar nome** (Configurações) | De 2 a 120 caracteres. |
| **Trocar avatar** | JPG, PNG ou WebP, até 2 MB. Validado no navegador e no servidor. Cada usuário só grava na própria pasta do storage. |

Código: `src/services/userService.ts`, `src/server/actions/user.ts`.

## 7. Seus dados: exportação e exclusão de conta

Direitos do titular previstos na LGPD (art. 18). Ficam em **Configurações › Seus dados**.

| Função | Como funciona |
|---|---|
| **Baixar meus dados** | Gera um JSON com conta, perfil, empresas e papéis, aceites de termos (com IP e navegador) e histórico de consentimentos. Rota `GET /api/account/export`. |
| **Excluir minha conta** | Pede o email do usuário como confirmação. A exclusão é definitiva. |

Regras da exclusão:

- **Bloqueada** se o usuário é owner de uma empresa com outros membros: precisa transferir a
  propriedade antes.
- **Bloqueada** se o usuário é o único membro de uma empresa com assinatura ativa, em teste ou em
  atraso: precisa cancelar antes.
- Empresas em que o usuário é o único membro são **encerradas** (soft delete) junto com a conta.
- Nas demais empresas fica um registro na auditoria (`member.account_deleted`).
- São apagados: avatar, usuário, perfil, memberships, aceites e consentimentos. Registros de
  auditoria permanecem, mas ficam sem o vínculo com a pessoa.
- Exportação e exclusão têm limite de 5 tentativas por hora por usuário.

Código: `src/services/accountService.ts`, `src/server/account.ts`, `src/server/actions/account.ts`.

## 8. Planos, assinatura e billing

Seed inicial dos planos (depois de aplicado, quem manda é o super admin, em `/admin/planos`):

| Plano | Preço | Cobrança | Membros inclusos | Membro extra | Clientes e orçamentos | Link de aprovação, OS e horas |
|---|---|---|---|---|---|:-:|
| Anual | 12x de R$ 329,90 | Até 12x no cartão, total de R$ 3.958,80, sem renovação automática | 10 | Não vende | Ilimitados | ✅ |
| Mensal | R$ 379,90/mês | Assinatura mensal por PIX, boleto ou cartão | 10 | R$ 19,90/mês | Ilimitados | ✅ |

**Anual parcelado:** no Asaas é um link parcelado, ou seja, uma compra única. Dá 12 meses de acesso desde a confirmação do primeiro pagamento e depois volta ao plano padrão, até contratar de novo. Cada parcela confirmada gera sua comissão, cobrindo 1 mês. Não há cancelamento pela tela: a desistência passa pelo suporte, e o estorno integral de qualquer parcela encerra o plano na hora. Como o valor não muda depois de contratado, o Anual não vende membro extra, e o convite é recusado quando as 10 vagas acabam. No Stripe, o parcelamento não existe: o plano anual seria cobrado de uma vez e renovaria.

Só os dois acima estão à venda, com o Anual em destaque e a economia calculada sobre o Mensal. O
plano gratuito (`free`) não aparece na oferta, mas continua valendo para a empresa sem assinatura. O
Empresarial foi desativado.

**Painel de planos** (`/admin/planos`, só super admin, revalidado no servidor em toda tela e ação):

- Cria planos e edita nome, preço, membro extra, limites, recursos e um texto livre de até 2000
  caracteres, exibido na oferta do plano em `/dashboard/billing`. A página inicial não mostra planos nem preços por enquanto. Ativa e desativa.
- O código do plano não muda depois de criado. Planos não são excluídos, só desativados: somem da
  oferta e quem já assina continua neles.
- Limites e recursos vêm de uma lista fechada no código (`src/config/planFeatures.ts`). Limite vazio
  é ilimitado.
- O plano padrão (`free`) não pode ser desativado nem cobrado, porque vale para quem não tem assinatura.
- Limites e recursos valem na hora para todas as empresas do plano.
- Preços não: cada assinatura guarda o preço e o valor do membro extra da contratação
  (`contracted_price_cents`, `contracted_extra_seat_price_cents`). Editar o plano só afeta novas
  assinaturas e trocas de plano.
- Toda alteração fica em `plan_audit_log`, com quem alterou, valor anterior e valor novo.
- Com Stripe, o painel avisa que o preço também precisa ser alterado lá.

| Função | Quem | Como funciona |
|---|---|---|
| **Ver plano e uso de vagas** (`/dashboard/billing`, em Configurações › Assinatura) | Owner | — |
| **Assinar / trocar plano** | Owner | Página de pagamento hospedada pelo gateway. No Asaas, o cliente escolhe PIX, boleto ou cartão. Com `PAYMENT_GATEWAY=fake`, ativa o plano direto, para desenvolvimento. |
| **Cancelar assinatura** | Owner | Cancela no gateway, sem novas cobranças. O plano e seus limites seguem até o fim do período pago, informado em `/dashboard/billing`, e depois a empresa passa para o Free. Nesse intervalo o owner pode assinar de novo, o que inicia uma nova cobrança. |
| **Estorno integral** | Automático (Asaas) | Estorno integral da cobrança do período atual cancela a assinatura no gateway e encerra o plano na hora, e a empresa passa para o Free. Estorno parcial ou de cobrança antiga não muda a assinatura. Fica na auditoria como `subscription.ended_by_refund`. No Stripe, o estorno ainda não é tratado e o encerramento é manual. |
| **Cobrança por seat** | Automático | Ao convidar, revogar ou remover membros, os extras são sincronizados com o gateway: item com quantidade (Stripe) ou novo valor total da assinatura (Asaas). |
| **Webhook de pagamento** (`POST /api/webhooks/[gateway]`, com `/payment` mantida para webhooks já cadastrados) | Gateway | Autenticidade verificada por cada provedor (HMAC no Stripe, token no Asaas). Os eventos atualizam `subscriptions` de forma idempotente e entram na auditoria. Em uma reassinatura, a assinatura anterior da empresa vai para o histórico e a nova assume. |
| **Limites por plano** | Código e banco | `canAccessFeature()` e `getFeatureLimit()` são o ponto único de checagem no código. Triggers repetem no banco os limites de membros, clientes e orçamentos e a criação de ordem de serviço e de horas. Quem passou do limite por downgrade não perde nada, só não cria mais. |
| **Escrita em assinatura** | Servidor | Só o webhook e o cancelamento gravam em `subscriptions`, com service_role. O usuário apenas lê. |

**Gateways disponíveis** (`PAYMENT_GATEWAY`):

| Gateway | Como cobra | Formas de pagamento | Portal do cliente |
|---|---|---|---|
| `asaas` | Pelo valor do plano no banco | PIX, boleto, cartão | Não |
| `stripe` | Pelo catálogo de preços (`PAYMENT_PRICE_*`) | Cartão | Sim |
| `fake` | Simulação local | — | Não |

Para adicionar outro provedor, basta um arquivo em `src/adapters/payment/` (passo a passo no
topo de `PaymentGateway.ts`).

Código: `src/services/billingService.ts`, `src/server/actions/billing.ts`, `src/adapters/payment/`.

## 9. Feature flags

Ainda sem tela: a configuração é feita por código ou banco.

- O valor padrão vem das features do plano da empresa.
- Overrides ficam em `settings`:
  - `feature:<chave>` vale para a empresa inteira;
  - `feature:<chave>:user:<userId>` vale para um usuário.
- Precedência: **usuário > empresa > plano**. Override que não seja booleano é ignorado.

Código: `src/services/featureFlagService.ts`.

## 10. Auditoria

| Função | Quem | Como funciona |
|---|---|---|
| **Trilha de auditoria** (`/dashboard/audit`, em Configurações › Auditoria) | Owner, admin | Lista paginada (20 por página) das ações na empresa: quem, o quê, quando. O histórico completo fica disponível em todos os planos. |
| **Registro automático** | Sistema | Edição da empresa, mudança de papel, remoção, saída, convites, transferência de propriedade, exclusão de conta, eventos de pagamento. |
| **Imutável** | — | O client não edita nem apaga registros. |
| **Dados sensíveis** | — | Chaves como senha, token, secret e card são removidas antes de gravar. |

Se a gravação da auditoria falhar, a action retorna erro. Uma trilha furada é tratada como pior
que uma operação recusada.

Código: `src/services/auditService.ts`, `src/server/audit.ts`.

## 11. Início e navegação

- **Início** (`/dashboard`): cartões de visitas de hoje e em negociação; visitas de hoje e amanhã; orçamentos aguardando resposta e aprovados por fechar. Owner e admin também veem saldo do mês, a pagar em 7 dias e o que vence hoje. Member não vê saldo nem gastos, e o técnico entra direto em Minhas visitas. Gráficos: agenda dos próximos 7 dias por tipo de visita (todos do escritório) e faturamento e gastos dos últimos 6 meses (owner e admin).
- **A pagar em 7 dias:** soma os gastos lançados e, no fim do mês, as recorrências do mês seguinte que vencem no prazo, ainda antes de virarem lançamento. A previsão não entra no saldo nem em "A pagar hoje".
- **Navegação:** no computador, menu lateral que colapsa em ícones ("rail"). Abaixo de 1024 px, abas fixas embaixo (Início, Serviços, Agenda e Orçamentos, ou Minhas visitas para o técnico) e "Mais", com os demais itens, tema e sair.
- **Início, saudação:** mostra bom dia, boa tarde ou boa noite no fuso da empresa e um resumo do mês com faturamento, gastos e saldo.
  Os itens aparecem conforme o papel:

  | Item | Quem vê |
  |---|---|
  | Início | Owner, admin, member. O técnico entra direto em Minhas visitas |
  | Configurações | Todos |
  | Minhas visitas | Técnico |
  | Serviços, Agenda, Orçamentos, Clientes, Catálogo, Equipe | Owner, admin, member |
  | Horas, Gastos, Financeiro, Membros | Owner, admin |

  Assinatura (owner) e Auditoria (owner, admin) ficam dentro de Configurações.

- **Idioma:** tudo o que aparece na tela está em português, inclusive papéis (Proprietário, Administrador, Membro e Técnico), situação da assinatura, ações da auditoria e mensagens de erro. Os códigos em inglês ficam só no banco e no código. Um teste E2E percorre as telas procurando inglês.
- **Máscaras:** CNPJ, CPF, telefone e valores têm máscara ao digitar (`src/components/masked-input.tsx`), e o servidor recusa CNPJ ou telefone incompletos. Valores mostram R$, agrupam milhares e fecham com centavos ao sair do campo: `1500` vira `1.500,00`, nunca `15,00`. Documentos e telefones também aparecem formatados nas listas, no link de aprovação e nos PDFs.
- **Aplicativo instalável (PWA):** instala pela tela inicial, abre em tela cheia, com entrada animada uma vez por abertura e atalhos para Agenda e Novo orçamento. No celular, um aviso dispensável oferece a instalação; no iPhone, explica o caminho pelo Safari. Sem internet, mostra uma tela de "Sem conexão". Guarda no aparelho só arquivos do sistema: telas, dados, fotos e assinaturas sempre vêm do servidor.
- **Tema** claro e escuro, com cor primária em `src/app/globals.css`. O menu lateral é escuro nos dois temas.
- **Nome do produto:** provisório e editável só em `src/config/brand.ts`. Um teste falha se o nome aparecer fixo em outro arquivo de `src/`.
- **Acessibilidade:** link "Pular para o conteúdo" (primeiro Tab), rótulos em pt-BR para leitores
  de tela, descrição textual nos gráficos.

## 12. Páginas públicas

| Página | Conteúdo |
|---|---|
| `/` | Landing page: proposta, dores, caminho do serviço, telas reais do sistema com dados fictícios (`public/landing/`), gráficos de exemplo avisados como fictícios, animações sutis que respeitam a preferência de menos movimento, bloco "Você sabe quanto sobrou no último serviço?" com exemplo fictício de resultado de um serviço, funções, contato pelo WhatsApp comercial (sem planos nem preços por enquanto), dúvidas e dados legais. O texto fica em `src/features/marketing/content.ts`. |
| `/terms` | Termos de Uso vigentes (versionados no banco). |
| `/privacy` | Política de Privacidade: controlador e operador, dados da conta e das empresas, fotos e assinaturas em campo, link de aprovação, bases legais, suboperadores, cookies, retenção e direitos. |
| `/refund` | Política de Reembolso: arrependimento em 7 dias (CDC), cancelamento, passagem para o Free, membros extras e como pedir. |
| `/demo` | Demonstração sem login: abre as telas reais de `/dashboard` com uma empresa fictícia (seção 26). |
| `/orcamento/[token]` | Link de aprovação do orçamento (seção 18). Sem login e fora de buscadores. |

O rodapé mostra os dados legais da empresa (`brand.legal` em `src/config/brand.ts`): razão social,
CNPJ, endereço, email de suporte e do encarregado de dados.

> Os textos de `/terms`, `/privacy` e `/refund` são **esqueletos sem valor jurídico**. Precisam de
> revisão profissional antes do uso com clientes reais.

## 13. Operação: health check, erros e rate limit

| Função | Como funciona |
|---|---|
| **Health check** (`GET /api/health`) | Retorna 200 `{"status":"ok"}` ou 503 com o item que falhou. Checa o banco com timeout de 3 s e não expõe detalhes internos. |
| **Monitoramento de erros** | `ERROR_REPORTER=console` (padrão, só log no servidor) ou `sentry` (exige `SENTRY_DSN`). Captura erros de actions, rotas de API e os que o Next pega sozinho. Remove dados sensíveis antes do envio. |
| **Formato único de erro** | O usuário vê só uma mensagem segura. Stack trace e detalhes ficam no servidor (`src/lib/errors`). |
| **Rate limit** | Login, cadastro e recuperação de senha (por email), convites (20/hora) e exportação/exclusão de conta (5/hora). Store `memory` (dev) ou `redis` (Upstash, produção). |

## 14. Integrações e provedores trocáveis

Toda integração externa fica atrás de uma interface em `src/adapters/`. Trocar de provedor
significa escrever um adapter novo, sem mexer em regra de negócio.

| Interface | Implementações | Variável |
|---|---|---|
| `PaymentGateway` | Asaas, Stripe, fake | `PAYMENT_GATEWAY` |
| `EmailProvider` | Resend, console | `EMAIL_PROVIDER` |
| `StorageProvider` | Supabase Storage (avatares em bucket público; fotos e assinaturas em bucket privado, com link temporário) | — |
| `NotificationProvider` | console | `NOTIFICATION_PROVIDER` |
| `ErrorReporter` | Sentry, console | `ERROR_REPORTER` |
| Rate limiter | memória, Upstash Redis | `RATE_LIMIT_STORE` |

Os emails de autenticação (confirmação e recuperação de senha) saem pelo Supabase Auth. O
`EmailProvider` cobre os emails transacionais do app, como convites.

## 15. Revendedores (em construção)

O módulo nasce **desligado**. O super admin opera tudo em `/admin/revendedores`.

**Área do vendedor** (`/vendedor`; acesso definido só pelo cadastro em `resellers`):

| Tela | Funções |
|---|---|
| Meu link | Link geral e por plano liberado, com botão de copiar. Bloqueado com o módulo desligado. |
| Meus clientes | Nome, plano, nº da venda, comissão e duração |
| Minhas comissões | Cliente, valor-base, comissão, status e datas |
| Minha conta | Exportar dados (inclui a revenda) e excluir a conta, bloqueada com comissão pendente. Ao excluir, os lançamentos ficam e os dados pessoais do vendedor são anonimizados. |

Depois do login, quem é só vendedor vai para `/vendedor`; quem também é cliente escolhe a área em `/escolher-area` e troca pelo menu do usuário. Suspenso perde o acesso e vê uma tela explicando o bloqueio (`/acesso-suspenso`); módulo desligado só bloqueia o Meu link.

**Painel do super admin** (toda tela e ação revalida o papel no servidor):

| Tela | Funções |
|---|---|
| Vendedores | Ligar/desligar o módulo, cadastrar por convite (código gerado ou informado), totais por vendedor |
| Página do vendedor | Editar nome e código, suspender/reativar, reenviar convite, ajustar comissão por cliente (marca override, vale para os próximos lançamentos), histórico de alterações |
| Regras e planos | Regras por vendedor e plano ou padrão global, com tipo, valor, duração e "a partir da venda nº"; liberar e esconder planos |
| Lançamentos | Filtros por vendedor, plano, status e período; editar valor; marcar vários como pagos, com data; exportar CSV com total por vendedor, respeitando os filtros (sem período, o mês atual) |
| Alertas e falhas | Vendas sem regra aplicável (`LINK_NO_RULE`), com "Vincular agora" sem retroativo, e falhas de comissão com botão de reprocessar |

**Comissão** (gateway Asaas; Stripe não gera comissão):

- **Contratação:** se a empresa nunca pagou, o checkout grava a indicação do cookie e cria o vínculo, só para plano liberado e sem auto-indicação. O nº da venda e a faixa de comissão são definidos no primeiro pagamento confirmado; checkout abandonado não conta.
- **Pagamento confirmado:** gera um lançamento por pagamento recebido, sobre o valor bruto: anual à vista gera 1, e 12 cobranças geram 12. O valor fixo vale por pagamento, sem multiplicar. A duração conta os meses cobertos pelo ciclo do plano (mensal 1, anual 12), e o valor é proporcional quando resta menos do que o pagamento cobre. Continua gerando com o módulo desligado.
- **Estorno:** reverte ou recalcula o lançamento pendente; o já pago não muda e fica sinalizado.
- **Assinatura cancelada:** encerra o vínculo.
- **Falha:** nunca afeta o pagamento. Fica em `reseller_commission_failures`, com reprocesso manual idempotente pela action `reprocessCommissionFailureAction`, só para o super admin.

**Link de afiliado** (`/r/CODIGO`, ou `?ref=CODIGO` em `/` e `/signup`):

- Grava o cookie `reseller_ref` no servidor (HttpOnly, SameSite=Lax, Secure em HTTPS, 30 dias) e redireciona para a página limpa, preservando os demais parâmetros, como `utm_*`.
- Vale o primeiro vendedor: cookie com código válido não é sobrescrito.
- Código inválido, vendedor suspenso ou módulo desligado são ignorados em silêncio: mesmo redirecionamento, sem cookie.
- Limite de 120 cliques por minuto por IP e instância: acima disso, o código é ignorado em silêncio.
- A validação fica em cache por 60 s por instância, então suspender um vendedor ou desligar o módulo pode levar esse tempo para valer nos cliques.
- Ao criar uma empresa, o código do cookie é gravado em `reseller_referrals`, salvo auto-indicação (mesmo usuário ou mesmo e-mail).

| Quem | O que pode, no banco |
|---|---|
| Super admin | Administra vendedores, regras, vínculos e lançamentos; toda mudança fica em `reseller_audit_log` |
| Vendedor ativo | Lê só os próprios dados, pelas views `reseller_me`, `reseller_my_clients`, `reseller_my_commissions` e `reseller_available_plans` |
| Backend | Vincula clientes e gera ou estorna lançamentos, pelas funções restritas ao `service_role` |

Regras já aplicadas: faixas por nº da venda, duração em meses cobertos, ajuste por cliente válido
só para os próximos lançamentos, um lançamento por pagamento e estorno que reverte o pendente e só
sinaliza o já pago. Pagamento que cobre mais meses que a duração restante gera comissão
proporcional. Cliente que volta reabre o vínculo dentro de `client_return_window_days` (padrão: 90
dias, em `reseller_settings`).

## 16. Clientes

Tela em `/dashboard/clients`, para owner, admin e member. O técnico não acessa os cadastros.

| Função | Quem | Regras |
|---|---|---|
| **Listar e buscar** | Owner, admin, member | Por nome ou documento, 20 por página. Tabela no desktop e cards no mobile. |
| **Orçamentos do cliente** | Owner, admin, member | A tela do cliente lista os orçamentos e as visitas dele, e cria orçamento ou visita já com o cliente preenchido. |
| **Criar e editar cliente** | Owner, admin, member | Nome obrigatório. Documento opcional: CPF com 11 dígitos ou CNPJ com 14. A criação respeita o limite `max_clients` do plano; acima dele, os dados continuam disponíveis e só não dá para criar novos. |
| **Contatos** | Owner, admin, member | Nome, função, telefone e e-mail. Um único principal por cliente: o primeiro já nasce principal, e marcar outro desmarca o anterior. |
| **Locais de atendimento** | Owner, admin, member | Nome, endereço completo e observações. |
| **Excluir cliente, contato ou local** | Owner, admin | Soft delete. Removido o contato principal, o mais antigo assume. Cliente com orçamento, visita ou hora lançada, ou local com orçamento ou visita, não pode ser excluído. |

Toda alteração entra na auditoria. Isolamento por empresa testado em `supabase/tests/rls_test.sql`.

Código: `src/services/clientService.ts`, `src/server/actions/clients.ts`, `src/features/clients/`.

## 17. Catálogo

Tela em `/dashboard/catalog`, com produtos e serviços.

| Função | Quem | Regras |
|---|---|---|
| **Ver e usar nos orçamentos** | Owner, admin, member | Member vê nome e preço, sem custo nem margem. O técnico não acessa. |
| **Criar e editar** | Owner, admin | Tipo, nome, descrição, unidade, modo de preço (fechado ou por hora, só em serviços), preço, custo e ativo. Item inativo não aparece ao montar orçamentos. |
| **Excluir** | Owner, admin | Soft delete. Orçamentos guardam cópia dos valores e não mudam ao alterar ou excluir um item. |

O custo fica em uma tabela separada (`catalog_item_costs`), que só owner e admin leem.

Código: `src/services/catalogService.ts`, `src/server/actions/catalog.ts`, `src/features/catalog/`.

## 18. Orçamentos

Telas em `/dashboard/quotes`. O técnico não acessa.

**Cálculo:** preço fechado = quantidade × preço; por hora = horas × pessoas (mínimo 1) × valor por hora. Arredonda só no fim de cada linha. Total = subtotal − desconto, nunca negativo. O banco recalcula ao salvar. Valores em centavos.

| De | Para | Quem | Regras |
|---|---|---|---|
| Rascunho | Enviado | Owner, admin, member | Exige cliente e ao menos 1 item. Sem validade, usa a padrão da empresa. Enviar pelo WhatsApp já marca como enviado. |
| Rascunho ou enviado | Recusado | Owner, admin, member | Recusado é final. |
| Enviado | Aprovado | Owner, admin, member, ou o cliente pelo link | Pode ser registrado à mão quando o cliente responde por telefone. |
| Enviado | Expirado | Owner, admin, member, ou o job | O job roda de hora em hora e usa o fuso da empresa. |
| Expirado | Rascunho | Owner, admin, member | Reabrir pede nova validade. |
| Aprovado | Fechado | Owner, admin | Pede valor (> 0) e data de competência e cria a receita. |
| Fechado | Aprovado | Owner, admin | "Desfazer fechamento" apaga a receita. |

Outras regras:

- **Número** sequencial por empresa, gerado no banco, sem colisão.
- **Só rascunho é editável.** Os demais são somente leitura; "Duplicar" cria um rascunho novo com número e link próprios.
- **Excluir:** owner e admin, em rascunho, recusado ou expirado. Enviado precisa antes ser recusado ou expirado; aprovado e fechado não podem ser excluídos.
- **Limite do plano:** `max_quotes_month` vale ao criar e duplicar. Orçamentos excluídos continuam contando no mês. Acima do limite nada é apagado, e os rascunhos existentes seguem editáveis.
- **Custo, imposto, lucro e margem** estimados aparecem só para owner e admin e nunca vão para o PDF nem para o link. O custo de cada item vem do catálogo e pode ser trocado no orçamento. O imposto usa a alíquota de hoje da empresa (seção 25) sobre o total; sem regime informado, não entra e a tela avisa.
- **Valor a mais por item** (owner e admin, faixa "Só você vê"): quando o valor unitário digitado é o que a empresa paga (a um parceiro, por exemplo), o campo "A mais nesta linha", em % sobre esse valor ou em R$ por unidade, forma o preço que o cliente vê. O cliente recebe só o preço final no PDF, no link e no WhatsApp. O valor digitado fica guardado como custo do item em `quote_item_costs`, que só owner e admin leem; ao reabrir, o "a mais" aparece em R$. A linha mostra quanto a empresa ganha. Sem "a mais", vale o custo do catálogo. Quando o membro edita o rascunho, ele vê só o preço final e o custo continua. Duplicar leva os custos.
- **PDF** gerado no navegador (`jspdf`). **WhatsApp** por link `wa.me`, sem provedor, para o contato principal.
- **Dados para orçamentos** (Configurações, owner e admin): CNPJ, telefone, e-mail, endereço, validade padrão, observações padrão, fuso e meta de margem. O imposto fica em Configurações › Impostos (seção 25). Todos os papéis leem, porque o documento precisa deles.

**Link de aprovação** (`/orcamento/[token]`, recurso `public_approval` do plano):

- Sem login, com token aleatório próprio de 256 bits, nunca o id do orçamento. Rascunho não abre.
- Mostra só o que o cliente precisa ver e permite baixar o PDF.
- Aceita resposta apenas com status enviado e dentro da validade, uma única vez. Exige nome, e motivo na recusa.
- Rate limit por IP: 10 respostas a cada 10 minutos e 60 visualizações por minuto. A escrita passa pelo servidor.
- A resposta aparece no orçamento e entra na auditoria.

Toda escrita passa por funções do banco; o client só lê estas tabelas. Isolamento e permissões testados em `supabase/tests/rls_test.sql`.

Código: `src/services/quoteService.ts`, `src/lib/quoteCalc.ts`, `src/server/actions/quotes.ts`, `src/features/quotes/`, `supabase/migrations/20261031140000_quotes.sql`.

## 19. Equipe

Tela em `/dashboard/team`. O técnico não acessa.

| Função | Quem | Regras |
|---|---|---|
| **Ver a lista** | Owner, admin, member | Member vê só nome, função, situação e próximas visitas. |
| **Cadastrar e editar** | Owner, admin | Nome, função, telefone, contrato (CLT, PJ ou autônomo), custo por hora, valor pago por hora, razão social, CPF ou CNPJ, Pix e ativo. |
| **Vincular usuário** | Owner, admin | Opcional: nem toda pessoa tem login. O usuário precisa ser membro da empresa, e cada usuário se vincula a uma pessoa só. O vínculo é o que dá ao técnico acesso às próprias visitas. |
| **Excluir** | Owner, admin | Soft delete. Quem aparece em visita, gasto ou hora não é excluído, só desativado. |

Telefone, contrato e dados de pagamento ficam em uma tabela separada (`employee_payment_details`), que só owner e admin leem. Esses dados não entram na auditoria.

Código: `src/services/employeeService.ts`, `src/server/actions/team.ts`, `src/features/team/`.

## 20. Agenda

Tela em `/dashboard/schedule`, com visões de mês e semana, filtros por pessoa e tipo e a lista do dia selecionado.

| Função | Quem | Regras |
|---|---|---|
| **Ver e agendar** | Owner, admin, member | Tipo (visita técnica ou execução), cliente, local, data, início, fim, situação, orçamento opcional, equipe e observações. |
| **Excluir** | Owner, admin | Soft delete. A exclusão libera o horário da equipe. |
| **Agendar a partir de outra tela** | Owner, admin, member | "Agendar visita" no cliente e "Agendar execução" no orçamento aprovado ou fechado já preenchem os dados. |

Regras:

- Exige cliente, local do próprio cliente, data, fim depois do início e ao menos 1 pessoa ativa. Quem foi desativado depois de escalado pode continuar na visita, mas não entra em visita nova.
- **Conflito de horário:** a mesma pessoa não fica em duas visitas ativas (agendada ou em andamento) com horário sobreposto. O formulário avisa ao vivo, e o banco bloqueia com uma restrição `EXCLUDE`, à prova de dois usuários salvando ao mesmo tempo. Horários que só encostam não conflitam. Cancelar, concluir ou excluir libera o horário.
- Datas e horas são data + hora local da empresa.
- O técnico vê só as próprias visitas, sem editar, em Minhas visitas (seção 21).
- Visita com ordem de serviço assinada não pode ser reaberta nem excluída.

Toda escrita passa por funções do banco; o client só lê estas tabelas. Testes em `supabase/tests/rls_test.sql`.

Código: `src/services/visitService.ts`, `src/lib/calendar.ts`, `src/server/actions/visits.ts`, `src/features/visits/`, `supabase/migrations/20261031150000_employees_visits.sql`.

## 21. Ordem de serviço

Tela para celular em `/dashboard/my-visits` (lista) e `/dashboard/work-orders/[visitId]` (ordem de serviço). Recurso `work_orders` do plano.

| Função | Quem | Regras |
|---|---|---|
| **Ver as próprias visitas** | Quem está escalado | Próximas e concluídas recentes. Mostra cliente, local, contato e equipe, sem documento nem observações do cliente. Só funciona com pessoa da equipe vinculada ao usuário. |
| **"Cheguei"** | Quem está escalado | Põe a visita em andamento e cria a ordem de serviço com o checklist do atendimento ou, sem ajuste, o modelo da empresa para o tipo da visita. Repetir não duplica. |
| **Modelos de checklist** (`/dashboard/settings/checklists`, em Configurações › Checklists) | Owner, admin | Uma lista por tipo de visita, até 30 itens de até 120 caracteres. Empresa sem modelo usa a lista padrão. Ordens já iniciadas não mudam. |
| **Checklist do atendimento** (na visita agendada) | Quem edita a agenda | Inclui, altera ou tira itens só daquela visita, sem mudar o modelo. "Usar o modelo" desfaz o ajuste. |
| **Incluir item em campo** | Quem está escalado | Acrescenta itens à ordem aberta, até 50 no total. Não remove os existentes. |
| **Concluir com itens em aberto** | Quem está escalado | Permitido. A tela avisa a quantidade, sem bloquear. |
| **Checklist, relatório e início real** | Quem está escalado | Salvos automaticamente enquanto a ordem está aberta. |
| **Fotos com legenda** | Quem está escalado | Tiradas na hora pela câmera ou enviadas do aparelho. A legenda pode ser incluída ou alterada enquanto a ordem estiver aberta. Até 30 por ordem. Comprimidas no navegador (até 900 KB). O servidor confere o tipo real do arquivo. |
| **Concluir** | Quem está escalado | Exige assinatura, nome de quem assinou e fim depois do início. A visita vira concluída, e a ordem não muda mais. |
| **Ver e baixar PDF** | Owner, admin, member; técnico nas próprias | O escritório só lê. PDF com cabeçalho da empresa, dados do cliente, checklist, relatório, fotos numeradas em duas colunas com legenda e assinatura, gerado no navegador. |

Regras:

- Fotos e assinatura ficam no bucket privado `work-orders`, com policies por empresa e visita, e abrem por link temporário de 1 hora. Nunca ficam como data URL no banco.
- Outro técnico da empresa não abre a visita. Quem não está escalado não preenche, mesmo sendo owner.
- O escritório ainda pode marcar uma visita como concluída direto na agenda, sem ordem de serviço.
- Concluir gera apontamentos pendentes para a equipe da visita, sem duplicar (seção 22).

Toda escrita passa por funções do banco; o client só lê estas tabelas. Testes em `supabase/tests/rls_test.sql`.

Código: `src/services/workOrderService.ts`, `src/server/actions/workOrders.ts`, `src/features/work-orders/`, `supabase/migrations/20261031160000_work_orders.sql`.

## 22. Horas

Tela em `/dashboard/hours`, só para owner e admin, com o recurso `hours` do plano. Serve para gestão e pagamento de prestadores e **não substitui ponto eletrônico de CLT**; a tela avisa isso.

| Função | Regras |
|---|---|
| **Sugestões da agenda** | Visitas até hoje e não canceladas sugerem horas para quem foi escalado. Com ordem de serviço, valem os horários reais. Jornadas acima de 6 h têm intervalo padrão de 1 h. |
| **Ajustar, retirar e incluir de volta** | Ajustar uma sugestão a transforma em apontamento. O que é retirado não conta no total nem no fechamento. |
| **Horas avulsas** | Pessoa, data, entrada, saída, intervalo, cliente opcional e observações. Só até hoje. |
| **Sobreposição** | A mesma pessoa não tem duas horas no mesmo horário; o banco bloqueia. |
| **Status** | Pendente, aprovado ou pago. A ordem de serviço concluída gera pendentes, sem duplicar; quem já tem horas nesse horário continua como sugestão. |
| **Fechar e pagar** | Só PJ e autônomo, com valor por hora cadastrado. Paga o que está na lista do mês, inclusive sugestões, lança um gasto e marca como pago, tudo na mesma transação. O valor é calculado sobre o total de minutos. |
| **Pago** | Não muda nem é excluído. Excluir o gasto em Gastos devolve as horas para aprovado, e elas podem ser fechadas de novo. |
| **CLT** | Aparece só ao pedir "Mostrar também CLT" e não fecha horas: recebe por recorrência em Gastos. |

Toda escrita passa por funções do banco. Testes em `supabase/tests/rls_test.sql`.

Código: `src/services/hoursService.ts`, `src/lib/hoursCalc.ts`, `src/server/actions/hours.ts`, `supabase/migrations/20261031170000_hours_expenses.sql`.

## 23. Gastos

Tela em `/dashboard/expenses`, só para owner e admin, com Lançamentos (calendário ou lista), Recorrentes, Categorias e Fornecedores.

| Função | Regras |
|---|---|
| **Lançamentos** | Descrição, valor, data, categoria, fornecedor, forma de pagamento (PIX, dinheiro, débito, crédito, boleto, transferência ou outro), serviço, funcionário e observações; só os quatro primeiros são obrigatórios. Tipos: pontual, recorrente, folha e prestador. |
| **Fornecedor no lançamento** | Ao digitar, lista os fornecedores cadastrados (sem diferença de acento ou maiúscula). Nome novo vira cadastro ao salvar o gasto, sem duplicar um que já existe. |
| **Fornecedores** (aba) | Nome, CNPJ ou CPF, telefone e observações. Mostra, em 3 meses, 12 meses ou tudo, quanto foi para cada fornecedor, número de compras, última compra e categorias principais, e "De quem mais compramos": os 3 fornecedores que mais receberam em cada categoria. Excluir mantém o nome nos gastos já lançados. |
| **Recorrências** | Valor, categoria, dia de 1 a 28, início, fim opcional, ativa e funcionário opcional. Com funcionário, gera folha. |
| **Geração mensal** | Um lançamento por mês para cada recorrência, por job idempotente, respeitando início e fim e sem gerar mês futuro. O job roda todo dia, por causa do fuso de cada empresa, e o botão "Gerar recorrentes do mês" faz o mesmo na hora. Excluir o lançamento de um mês não o faz voltar. |
| **Editar um lançamento gerado** | Muda só aquele mês. Editar a recorrência vale para os próximos. |
| **Excluir recorrência** | O que já foi gerado continua. |
| **Pagamento de prestador** | Vem do fechamento das horas e não é editado. Excluir devolve as horas para aprovado. |
| **Categorias** | Toda empresa nasce com as categorias padrão. Categoria em uso ou usada pelo sistema não é excluída. |

Código: `src/services/expenseService.ts`, `src/server/actions/expenses.ts`, `src/features/expenses/`.

## 24. Financeiro

Tela em `/dashboard/finance`, só para owner e admin.

| Função | Regras |
|---|---|
| **Resumo do mês** | Faturamento, gastos e saldo, com a variação sobre o mês anterior. O saldo pode ficar negativo. |
| **Faturamento** | Vem só de orçamentos fechados, na data de competência. Desfazer o fechamento tira o valor. |
| **Últimos 6 meses** | Gráfico de faturamento e gastos, com tabela equivalente. |
| **Gastos por categoria** | Só do mês escolhido, da maior para a menor. |
| **Previsão** | Aprovados a fechar e enviados aguardando resposta. Fica separada e não entra no saldo. |
| **Listas** | Orçamentos fechados e lançamentos de gasto do mês. |

Código: `src/services/financeService.ts`, `src/app/dashboard/finance/page.tsx`.

## 25. Custos e resultado por serviço

Para orçamentos aprovados ou fechados. Só owner e admin: membro e técnico não veem custos nem margem.

| Função | Regras |
|---|---|
| **Serviços** (`/dashboard/services`, logo abaixo de Início e aba fixa no celular) | Em andamento (aprovados) e Concluídos (fechados). Cada serviço mostra visitas feitas, a próxima visita e, para owner e admin, cobrado, custos, resultado e margem, com "Lançar gasto" e "Concluir e faturar". Alerta quando o custo passa do previsto ou a margem fica abaixo da meta. O membro vê o andamento, sem valores. |
| **Custos do serviço** (na página do orçamento) | Valor cobrado, custos e imposto, e resultado, com a margem em % comparada à meta da empresa: verde na meta ou acima, laranja abaixo, vermelho no prejuízo. |
| **Imposto estimado** | Alíquota sobre o valor cobrado, descontada do resultado e mostrada como categoria de custo. Vem do padrão da empresa e fica gravada no orçamento quando ele é aprovado (pela tela ou pelo link): mudar o padrão depois não mexe em serviço já aprovado. Owner e admin podem trocar a alíquota de um serviço aprovado ou fechado ("Alterar alíquota"), de 0 a 40% com até duas casas; a troca entra na auditoria. Orçamentos aprovados antes desta função seguem o padrão atual da empresa até alguém definir a alíquota deles. |
| **Impostos** (Configurações › Impostos, `/dashboard/settings/impostos`, owner e admin) | Regime: não informado, MEI, Simples Nacional ou outro. Sem regime, o resultado não desconta imposto e o serviço mostra o aviso. No MEI a alíquota é zero: o DAS mensal fixo entra como gasto recorrente. Em outro regime, a alíquota é informada em %. No Simples Nacional, a empresa escolhe entre informar a alíquota (a efetiva que o contador passa) e calculá-la pelo faturamento. Mudanças entram na auditoria, sem os valores de faturamento. |
| **Cálculo pelo faturamento (RBT12)** | Opcional, só no Simples Nacional, com o anexo escolhido: III (a maior parte dos serviços), IV (construção civil, limpeza, vigilância) ou V (serviços técnicos e intelectuais). Todo mês, soma o faturamento dos 12 meses anteriores e aplica (RBT12 × alíquota nominal da faixa − parcela a deduzir) ÷ RBT12, pelas tabelas da LC 123/2006. Anexo V com folha de 28% ou mais do faturamento (Fator R, marcado pela empresa) usa o Anexo III. Com menos de 12 meses desde o início das atividades (opcional), usa a média dos meses × 12; no primeiro mês, a primeira faixa. Acima de R$ 4,8 milhões, fica na última faixa e a tela avisa que a empresa passou do teto. A tela mostra a conta passo a passo e, no modo informado, a alíquota que o cálculo daria como sugestão. A conta é feita no banco, e é ela que fica gravada ao aprovar, inclusive pelo link do cliente. |
| **Faturamento dos 12 meses** | Para cada mês, o lançado no sistema (orçamentos fechados, pela data de competência) e um campo opcional "Informado", que vale no lugar dele: para os meses de antes do sistema ou quando o faturamento real foi outro. Só meses já fechados, dos últimos dois anos. A alíquota é recalculada na tela enquanto se digita. Só owner e admin leem e informam (`company_monthly_revenues`). |
| **Gastos do serviço** | São os mesmos gastos do caixa (`expenses`), com o campo opcional "Serviço (orçamento)" e "Fornecedor". "Lançar gasto" já vem com o orçamento escolhido. Só gasto pontual pode ser ligado, e só a orçamento aprovado ou fechado da mesma empresa (trava no banco). |
| **Mão de obra** | Horas lançadas nas visitas do orçamento vezes o custo por hora de cada pessoa (em Equipe); sem ele, o valor pago por hora ao prestador. A hora do CLT é custo apropriado: o salário continua saindo uma vez só, no caixa do mês. Horas sem custo cadastrado geram aviso. |
| **Previsto x realizado** | Compara o custo previsto no orçamento (o custo de cada item, ou o do catálogo) com o custo real. |
| **Relatório do serviço** | PDF de uso interno com resultado, imposto estimado, custos por categoria, gastos e horas. |
| **Resultado por serviço** (Financeiro) | Serviços fechados no mês, do maior resultado ao prejuízo, com a margem, já descontado o imposto estimado. |
| **Meta de margem** (Configurações › Dados para orçamentos) | De 0 a 100%, padrão 20%. |

O resultado desconta o imposto estimado, mas não as despesas fixas: é a margem do serviço, não o lucro líquido da empresa. O imposto do serviço é estimativa: a guia paga de verdade entra no caixa como gasto da categoria "Impostos", e só ela conta no saldo do Financeiro. As duas coisas não se somam.

Testes: `src/services/serviceCostService.test.ts`, `src/services/taxService.test.ts`, `src/lib/tax.test.ts`, `src/lib/simplesNacional.test.ts` e os blocos "Imposto do serviço" e "Simples Nacional pelo RBT12" em `supabase/tests/security_regression_test.sql`.

## 26. Demonstração

Os valores de faturamento e gastos da demonstração acompanham o mês atual, para o financeiro nunca abrir zerado na virada do mês.

Qualquer pessoa entra por "Ver demonstração", na página inicial, e navega pelas telas reais sem criar conta.

| Regra | Como funciona |
|---|---|
| **Sem banco** | Com o cookie da demonstração, os clients de servidor e de administrador são trocados por um substituto em memória (`src/server/demo/client.ts`), com dados fixos e sem URL nem chave. O proxy também não cria client. |
| **WhatsApp do orçamento** | "Enviar pelo WhatsApp" abre conversa com o WhatsApp comercial, nunca com os telefones fictícios dos clientes. |
| **Link do orçamento** | `/orcamento/demonstracao-NNNN` abre sem login, com aviso de demonstração e dados fictícios, sem tocar no banco. Aprovar ou recusar responde "Na demonstração não é possível salvar". |
| **Nada é salvo** | Formulários abrem e botões continuam visíveis. Ao salvar, aparece "Na demonstração não é possível salvar". Fotos, assinaturas e pagamento também são recusados. |
| **Dados** | Empresa fictícia em `src/server/demo/fixtures.json`. As datas são recalculadas para perto de hoje, sem rotina nem escrita. |
| **Perfis** | Escritório, com visão de proprietário, ou técnico, com as próprias visitas e a ordem de serviço. |
| **Saída** | "Sair", ir para outra página do site ou criar conta encerra a demonstração. Sem uso, o cookie expira em 2 horas. |
| **Fora da demonstração** | Painel de planos, revendedores e demais áreas fora de `/dashboard` redirecionam para o início da demonstração. |

Um cookie falso não dá acesso a nada: ele só faz o servidor entregar os dados fictícios.
