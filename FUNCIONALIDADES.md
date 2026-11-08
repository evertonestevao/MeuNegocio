# Funcionalidades do sistema

O que o MeuNegócio faz, quem pode usar cada função e quais regras se aplicam. Para setup,
arquitetura e deploy, veja [DOCUMENTACAO.md](DOCUMENTACAO.md).

> **Mantenha este arquivo atualizado.** Toda mudança que cria, altera ou remove uma
> funcionalidade atualiza a seção correspondente no mesmo commit.

**Última atualização:** 2026-11-08

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
27. [Prevenção de fraude e comprovantes](#27-prevenção-de-fraude-e-comprovantes)

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
| **Cadastro fechado** | Padrão (`SIGNUP_ENABLED=false`). A página inicial e o login não oferecem criar conta: "Quero contratar" abre o WhatsApp comercial (`brand.salesWhatsapp`) com a mensagem pronta, `/comecar` leva ao login e o servidor recusa o cadastro, salvo para e-mail com convite pendente. Para abrir, `SIGNUP_ENABLED=true`. A conta é sempre criada **pelo servidor** (service_role), nunca pelo `signUp` público — assim o cadastro direto pela API do Supabase pode ficar desligado (`enable_signup=false`) sem afetar o login. | — |
| **Cadastro em etapas** (`/comecar`) | Com o cadastro aberto, "Assinar" e "Assinar com 7 dias grátis" da página inicial levam a ele. Não há escolha entre assinar e testar: o caminho é sempre o da assinatura, com o destaque "Os primeiros 7 dias são grátis. Escolha o plano no próximo passo. Se cancelar nesse período, não paga nada." **1. Seus dados:** nome, e-mail, aceite dos Termos e da Privacidade (obrigatório) e consentimento de e-mail (opcional). Um aviso com ícone de informação diz que nome e e-mail ficam guardados a partir dali. Ao continuar, tudo é gravado em `signup_leads`, com versão dos termos, IP e navegador. **2. Senha** (`/comecar/senha`): o e-mail vem do passo anterior e não muda ali; "Nome ou e-mail errado? Corrigir" volta ao passo 1 com nome, e-mail e caixas de aceite como estavam. Se o e-mail mudar, o cadastro com o e-mail anterior é apagado. A senha cria a conta, registra o aceite do passo 1 (se a versão ainda é a vigente) e cria a empresa com nome provisório ("Empresa de ‹nome›"). Em seguida vem **3. Assinatura** (`/assinar`), com o teste com cartão quando o meio de pagamento permite e o teste sem cartão no fim da tela. **4. Sua empresa** (`/onboarding`): nome e telefone obrigatórios, CNPJ opcional e, recolhidos, e-mail, fuso e endereço. Até concluir, o painel manda o proprietário de volta para esse passo. | Primeiro passo: 5 envios por endereço de rede a cada 10 minutos (`SIGNUP_RATE_LIMIT_PER_IP`) e 3 por e-mail por hora. Campo escondido contra robôs: preenchido, responde normal e não grava. O passo 2 só abre com o cookie httpOnly do passo 1 (2 dias) e cria no máximo 5 contas por endereço por hora. Mesmo e-mail de novo atualiza o cadastro, sem duplicar. Senha com no mínimo 8 caracteres. |
| **Cadastro por convite** (`/signup?next=/invites/accept…`) | Nome completo, e-mail e senha, para quem recebeu convite. Sem convite, `/signup` leva a `/comecar` (aberto) ou ao login (fechado). | Rate limit por email. |
| **Login** (`/login`) | Email e senha. Respeita `?next=` para voltar à página de origem. | 10 tentativas por minuto por email. O `?next=` só aceita caminho do próprio site (`src/lib/safeRedirect.ts`): endereço de outro site, `//`, barra invertida ou caractere de controle levam ao destino padrão. Vale também para o cadastro por convite e para `/auth/confirm`. |
| **Logout** | Menu do usuário, no topo do painel. | Encerra só a sessão deste aparelho: o celular continua logado quando se sai no computador, e vice-versa. Aparelho com sessão encerrada no servidor (conta excluída, sessão revogada) cai no login, que limpa os cookies dessa sessão. |
| **Esqueci a senha** (`/forgot-password`) | Envia um link de redefinição por email. | Sempre responde "se o email existir…", para não revelar quais emails têm conta. Rate limit por email. |
| **Redefinir senha** (`/reset-password`) | Abre pelo link do email (fluxo PKCE via `/auth/confirm`). | Só aceita redirects para domínios permitidos. |

Rotas do painel exigem login. Usuário logado que abre `/login`, `/signup` ou `/comecar` é redirecionado.

**Cadastros iniciados** (`/admin/cadastros`, só super admin): lista os 100 mais recentes com nome, e-mail, até onde chegou (antes da senha; conta criada sem terminar; concluído) e data. A tabela só é lida pelo super admin (RLS) e só o servidor grava. Os registros são apagados automaticamente 90 dias depois da última atualização (`pg_cron`, diário).

Código: `src/services/authService.ts`, `src/services/signupFlowService.ts`, `src/server/actions/auth.ts`, `src/server/actions/signup.ts`, `src/proxy.ts`.

## 3. Termos de uso e consentimentos

| Função | Como funciona |
|---|---|
| **Termos versionados** | Cada versão fica em `terms_versions`; só uma é a vigente. A página pública `/terms` mostra a vigente. |
| **Aceite no cadastro** | No cadastro em etapas, o aceite é marcado no primeiro passo, junto com nome e e-mail, e vira o aceite da conta quando a senha é criada. Quem cria empresa sem ter aceitado (convite, conta antiga) aceita em `/onboarding`. |
| **Reaceite obrigatório** | Ao publicar uma versão nova, todo usuário é levado a `/accept-terms` antes de continuar. |
| **Evidência do aceite** | Grava data, IP e navegador de cada aceite (LGPD). Só o servidor grava, com os dados da request, e o usuário não consegue inserir nem alterar o registro. |
| **Consentimento por finalidade** | Hoje existe a finalidade `email_communications` (opcional, revogável). Cada mudança gera um registro novo, com histórico. |

Publicar termos novos: migration em produção, ou `scripts/publish-terms.sh` em desenvolvimento.

Código: `src/services/termsService.ts`, `src/server/actions/terms.ts`.

## 4. Empresas (multi-tenant)

| Função | Quem | Como funciona |
|---|---|---|
| **Criar empresa e acesso** (`/admin/empresas`) | Super admin | Cria a empresa, o proprietário e, se escolhido, libera um plano sem cobrança, pelo período dele e sem renovar. Mostra uma senha temporária uma única vez; no primeiro acesso, a pessoa precisa trocá-la. Falhou no meio, nada fica para trás. |
| **Dados essenciais da empresa** (`/onboarding`) | Owner e admin da empresa criada pelo cadastro em etapas | Último passo do cadastro: troca o nome provisório pelo nome de verdade e grava telefone (obrigatórios), CNPJ, e-mail, fuso e endereço; validade e margem ficam no padrão. Erro não apaga o que foi digitado, e todos os problemas aparecem de uma vez, cada um junto do seu campo (com "Mais dados" aberto quando o erro está lá). Concluído, não abre de novo. Empresas antigas ou criadas pelo super admin não passam por aqui. |
| **Criar empresa** (`/onboarding`, conta sem empresa; seletor "Nova empresa") | Com o cadastro aberto, qualquer usuário logado; fechado, só o super admin | Quem cria vira owner. O slug é gerado a partir do nome (com sufixo se já existir). No primeiro acesso, pede também os dados da empresa usados nos orçamentos: CNPJ, telefone, e-mail, endereço, fuso, validade padrão e observações. Só o nome é obrigatório. Dado inválido é recusado antes de criar a empresa, sem apagar o que foi digitado. A empresa nova começa sem dados de exemplo. O banco só cria a empresa para quem já aceitou os termos, e limita a 5 empresas por usuário (anti criação em massa). |
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
| **Foto de perfil** | Não existe: por decisão do produto, a pessoa não envia foto. O menu e a lista de membros mostram as iniciais. O banco não aceita gravar foto (bucket `avatars` sem policy de escrita; em `profiles`, o usuário só altera o nome). A única imagem que a empresa envia é o logo. |

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
plano gratuito (`free`) não aparece na oferta e não é um plano de uso: a empresa sem assinatura válida
não entra no painel (ver "Teste grátis e tela de assinar"). Ele só guarda os limites que o banco aplica
a quem tenta usar a API sem assinatura. O Empresarial foi desativado.

**Teste grátis e tela de assinar** (`/assinar`):

- Empresa sem assinatura válida (nova, teste vencido, cancelada depois do período pago ou estornada) vai para `/assinar` em qualquer tela do painel. Os dados ficam guardados; ao assinar, tudo volta como estava. A demonstração nunca é bloqueada.
- **Proprietário:** escolhe o plano (Mensal primeiro, Anual com a economia) e vê o que está incluso. O botão grande é **"Começar agora: 7 dias grátis"**, com o cartão: "Nada é cobrado hoje. A primeira cobrança de R$ X será em dd/mm/aaaa. Cancele antes e não paga nada." O teste sem cartão não é oferecido por enquanto (`CARDLESS_TRIAL_OFFERED = false` em `src/services/billingService.ts`): a tela não mostra a opção e o servidor recusa o pedido. Quem já estava num teste sem cartão segue até o fim dele.
- **Teste com cartão** só no Mensal e só em meio de pagamento que adia a primeira cobrança (Stripe; e o de testes). No Asaas, o checkout atual cobra na hora: o botão vira "Assinar o plano Mensal", com "Cobrança agora", até o adiamento ser validado no sandbox. O Anual sempre cobra na hora, em até 12x. Na ativação com teste, a assinatura fica "em teste" até a primeira cobrança.
- **Teste sem cartão** (desligado por enquanto; regras guardadas para quando voltar): 7 dias do plano Mensal completo, sem gateway e sem renovação. **Uma vez por dono**, não por empresa: se o proprietário já testou ou já assinou em qualquer empresa dele (mesmo no histórico), nenhuma empresa dele ganha outro teste — assim criar empresa nova não renova o benefício. A mesma checagem vale para o adiamento do teste com cartão. Durante o teste, o painel mostra "Faltam N dias do seu teste grátis (até dd/mm)", com "Assinar agora" para o proprietário, e `/dashboard/billing` mostra o teste. Não há o que cancelar: ele termina sozinho, sem cobrança.
- **Administrador, membro e técnico** veem que quem assina é o proprietário, e que os dados continuam guardados.
- **Link do orçamento** de empresa sem assinatura continua abrindo para o cliente, só para ver e baixar: no lugar de aprovar, "Para aprovar este orçamento, fale direto com a empresa".

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
| **Ver plano e uso de vagas** (`/dashboard/billing`, em Configurações › Assinatura) | Owner | No teste com cartão, mostra até quando vai o teste e o valor e a data da primeira cobrança; assinatura ativa que renova mostra a data da próxima cobrança. |
| **Assinar / trocar plano** | Owner | Página de pagamento hospedada pelo gateway. No Asaas, o cliente escolhe PIX, boleto ou cartão. Com `PAYMENT_GATEWAY=fake`, ativa o plano direto, para desenvolvimento. |
| **Cancelar assinatura** | Owner | Cancela no gateway, sem novas cobranças. O plano e seus limites seguem até o fim do período pago, informado em `/dashboard/billing`, e depois o acesso pausa até assinar de novo, com os dados guardados. Nesse intervalo o owner pode assinar de novo, o que inicia uma nova cobrança. |
| **Estorno integral** | Automático (Asaas) | Estorno integral da cobrança do período atual cancela a assinatura no gateway e encerra o plano na hora, e o acesso pausa até assinar de novo. Estorno parcial ou de cobrança antiga não muda a assinatura. Fica na auditoria como `subscription.ended_by_refund`. No Stripe, o estorno ainda não é tratado e o encerramento é manual. |
| **Cobrança por seat** | Automático | Ao convidar, revogar ou remover membros, os extras são sincronizados com o gateway: item com quantidade (Stripe) ou novo valor total da assinatura (Asaas). |
| **Webhook de pagamento** (`POST /api/webhooks/[gateway]`, com `/payment` mantida para webhooks já cadastrados) | Gateway | Autenticidade verificada por cada provedor (HMAC no Stripe, token no Asaas; o gateway fake usa `FAKE_WEBHOOK_SECRET`, com valor padrão só para dev). Os eventos atualizam `subscriptions` de forma idempotente e entram na auditoria. Em uma reassinatura, a assinatura anterior da empresa vai para o histórico e a nova assume. **O gateway `fake` é recusado em produção** (`APP_ENV=production`): o boot falha, exigindo um gateway real, para que um webhook forjado não ative nem cancele assinatura. |
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
| **Trilha de auditoria** (`/dashboard/audit`, em Configurações › Auditoria) | Owner, admin | Lista paginada (20 por página) das ações na empresa: quem, o quê, quando. Orçamento, cliente, pessoa da equipe e item do catálogo aparecem com o nome ("Orçamento: Nº 0008 · Instalação de câmeras") enquanto o registro existe; excluído, fica só o tipo. Orçamento e cliente abrem com um clique. O histórico completo fica disponível em todos os planos. |
| **Registro automático** | Sistema | Edição da empresa, mudança de papel, remoção, saída, convites, transferência de propriedade, exclusão de conta, eventos de pagamento. |
| **Imutável** | — | O client não edita nem apaga registros. |
| **Dados sensíveis** | — | Chaves como senha, token, secret e card são removidas antes de gravar. |

Se a gravação da auditoria falhar, a action retorna erro. Uma trilha furada é tratada como pior
que uma operação recusada.

Código: `src/services/auditService.ts`, `src/server/audit.ts`.

## 11. Início e navegação

- **Início** (`/dashboard`): cartões de visitas de hoje e em negociação; visitas de hoje e amanhã; orçamentos aguardando resposta e aprovados por fechar. 
- **Primeiros passos** (Início, só proprietário e administrador): enquanto falta algo, um cartão mostra quanto já foi feito e leva a cada passo: enviar o logo, cadastrar serviços no catálogo, trazer os clientes e montar o primeiro orçamento. Some quando os quatro estão feitos, ou com "Não mostrar mais" (guardado no navegador, por empresa). Owner e admin também veem o caixa do mês (recebido − gastos), a pagar em 7 dias, o que vence hoje e um aviso de recebimentos atrasados e dos que vencem em 7 dias, com link para Contas a receber. Member não vê saldo nem gastos, e o técnico entra direto em Minhas visitas. Gráficos: agenda dos próximos 7 dias por tipo de visita (todos do escritório) e faturado, recebido e gastos dos últimos 6 meses (owner e admin).
- **A pagar em 7 dias:** soma os gastos lançados e, no fim do mês, as recorrências do mês seguinte que vencem no prazo, ainda antes de virarem lançamento. A previsão não entra no saldo nem em "A pagar hoje".
- **Navegação:** no computador, menu lateral que colapsa em ícones ("rail"). Abaixo de 1024 px, abas fixas embaixo (Início, Serviços, Agenda e Orçamentos, ou Minhas visitas para o técnico) e "Mais", com os demais itens, tema e sair.
- **Início, saudação:** mostra bom dia, boa tarde ou boa noite no fuso da empresa e um resumo do mês com faturado, recebido, gastos e caixa.
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
- **Ícone na guia:** todas as páginas mostram o "M" da marca na guia do navegador (`src/app/favicon.ico` e `src/app/icon.svg`) e na tela inicial do iPhone (`src/app/apple-icon.png`). Os arquivos saem de `node scripts/generate-pwa-icons.mjs`, junto com os ícones do aplicativo.
- **Tema** claro e escuro, com cor primária em `src/app/globals.css`. O menu lateral é escuro nos dois temas. O escuro só existe dentro do sistema logado (`/dashboard`, `/admin`, `/vendedor`), seguindo o tema do aparelho ou o "Alternar tema" do menu do usuário. Página inicial, login, cadastro, assinar, dados da empresa, páginas legais e o link do orçamento ficam sempre claros, mesmo com o aparelho no escuro; a escolha da pessoa volta ao entrar no painel (`src/config/theme.ts`).
- **Nome do produto:** provisório e editável só em `src/config/brand.ts`. Um teste falha se o nome aparecer fixo em outro arquivo de `src/`.
- **Acessibilidade:** link "Pular para o conteúdo" (primeiro Tab), rótulos em pt-BR para leitores
  de tela, descrição textual nos gráficos.

## 12. Páginas públicas

| Página | Conteúdo |
|---|---|
| `/` | Landing page: com o cadastro aberto, "Assinar" no topo, "Assinar com 7 dias grátis" no início e "Assinar agora" no fim levam ao cadastro em etapas; proposta, dores, caminho do serviço, telas reais do sistema com dados fictícios (`public/landing/`), gráficos de exemplo avisados como fictícios, animações sutis que respeitam a preferência de menos movimento, bloco "Você sabe quanto sobrou no último serviço?" com exemplo fictício de resultado de um serviço, funções, contato pelo WhatsApp comercial (sem planos nem preços por enquanto), dúvidas e dados legais. O texto fica em `src/features/marketing/content.ts`. |
| `/terms` | Termos de Uso vigentes (versionados no banco). |
| `/privacy` | Política de Privacidade: controlador e operador, dados da conta e das empresas, fotos e assinaturas em campo, link de aprovação, bases legais, suboperadores, cookies, retenção e direitos. |
| `/refund` | Política de Reembolso: arrependimento em 7 dias (CDC), cancelamento, o que acontece sem assinatura (dados guardados, acesso pausado), membros extras e como pedir. |
| `/denunciar` | Denúncia de uso indevido, sem login (seção 27). Também no rodapé da página inicial e no fim do link de cada orçamento. |
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
| **Rate limit** | Login, cadastro e recuperação de senha (por email), denúncia de uso indevido (5 por hora por endereço de rede), início do cadastro (por endereço de rede e por e-mail), criação de conta pelo cadastro em etapas (por endereço de rede), convites (20/hora) e exportação/exclusão de conta (5/hora). Store `memory` (dev) ou `redis` (Upstash, produção). |

## 14. Integrações e provedores trocáveis

Toda integração externa fica atrás de uma interface em `src/adapters/`. Trocar de provedor
significa escrever um adapter novo, sem mexer em regra de negócio.

| Interface | Implementações | Variável |
|---|---|---|
| `PaymentGateway` | Asaas, Stripe, fake | `PAYMENT_GATEWAY` |
| `EmailProvider` | Resend, console | `EMAIL_PROVIDER` |
| `CompanyRegistry` (consulta de CNPJ) | BrasilAPI (base pública da Receita, sem chave), fake (sem rede, para testes) | `COMPANY_REGISTRY` |
| `StorageProvider` | Supabase Storage (logo da empresa em bucket público; fotos e assinaturas em bucket privado, com link temporário) | — |
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
| **Listar e buscar** | Owner, admin, member | Por nome (sem diferença de acento ou maiúscula: "goncalves" acha "Gonçalves"), pelo endereço de qualquer local (rua, bairro, cidade: "promissao" acha os clientes de Promissão), por CPF/CNPJ e pelo telefone de qualquer contato, com ou sem pontuação. Filtros por tipo (pessoa física, pessoa jurídica ou sem CPF/CNPJ, pela quantidade de dígitos do documento: `clients.person_kind`) e por cidade (endereço dos locais: `client_locations.search_text`), que somam com a busca e continuam valendo ao trocar de página; "Limpar filtros" volta à lista toda (migration `20261107140000`). No celular, tipo e cidade ficam atrás do botão "Filtros", que já abre quando há filtro aplicado. O contato principal aparece com o nome só quando é outra pessoa (na importação, ele nasce com o nome do cliente). Número só é procurado como número a partir de 3 dígitos. 20 por página. Tabela no desktop e cards no mobile. O banco guarda o nome sem acento e o documento só com dígitos (`clients.search_text`) e o telefone só com dígitos (`client_contacts.phone_digits`), em colunas geradas. |
| **Orçamentos do cliente** | Owner, admin, member | A tela do cliente lista os orçamentos e as visitas dele, e cria orçamento ou visita já com o cliente preenchido. |
| **Criar e editar cliente** | Owner, admin, member | Nome obrigatório. Documento opcional: CPF ou CNPJ com os dígitos verificadores certos ("CPF inválido. Confira os números."); cliente antigo com documento inválido precisa corrigi-lo ao editar. A criação respeita o limite `max_clients` do plano; acima dele, os dados continuam disponíveis e só não dá para criar novos. |
| **Contatos** | Owner, admin, member | Nome, função, telefone e e-mail. Um único principal por cliente: o primeiro já nasce principal, e marcar outro desmarca o anterior. |
| **Locais de atendimento** | Owner, admin, member | Nome, endereço completo e observações. |
| **Importar planilha** (`/dashboard/clients/importar`, botão na lista e na tela vazia) | Owner, admin, member | Arquivo CSV, como o Excel e o Google Planilhas salvam (separador ";", "," ou tabulação; acento em UTF-8 ou no formato do Excel antigo), até 1000 clientes e 2 MB. "Baixar modelo" traz a planilha pronta. A primeira linha tem os títulos; só o nome é obrigatório, e as colunas são reconhecidas por nomes comuns, com ou sem acento: nome/cliente/razão social, CPF/CNPJ, telefone/celular/WhatsApp, e-mail, contato/responsável, endereço/rua/logradouro, número/nº, complemento, bairro, cidade, estado/UF, CEP e observações. A prévia mostra cada coluna da planilha com um exemplo e o que ela é, reconhecido pelo título; a pessoa troca à mão quando o sistema não reconheceu (ex.: "Fone do cliente" → Telefone) ou marca "Não importar". Cada campo vale para uma coluna só, a conferência das linhas refaz na hora e, sem coluna de nome, o botão de importar fica desligado até ela ser escolhida. Cada linha vira cliente, contato principal (com o nome do contato ou, sem ele, o do cliente) e o local "Principal", com o endereço numa linha só: "Rua das Flores, 120, Loja 2 - Centro, Bauru/SP - CEP 17010-000" (parte vazia some; só a cidade também vale, mesmo curta como "Itu": o banco aceita endereço a partir de 2 caracteres). Antes de gravar, a prévia mostra cada linha, com o endereço montado: pronta, já cadastrada (mesmo CPF/CNPJ, ou mesmo nome sem documento, inclusive repetida na planilha) ou com erro (sem nome, CPF/CNPJ incompleto ou com dígito verificador errado, telefone sem DDD, e-mail inválido), com o número da linha. Nome e documento são conferidos antes do duplicado, e o duplicado antes de contato e endereço. Só as prontas entram, todas numa transação: ou entram todas, ou nenhuma. O servidor confere tudo de novo, pula duplicados e respeita o limite de clientes do plano. Planilha .xlsx pede para salvar em CSV. Entra na auditoria com a quantidade. |
| **Excluir cliente, contato ou local** | Owner, admin | Soft delete. Removido o contato principal, o mais antigo assume. Cliente com orçamento, visita ou hora lançada, ou local com orçamento ou visita, não pode ser excluído. |

Toda alteração entra na auditoria. Isolamento por empresa testado em `supabase/tests/rls_test.sql`.

Código: `src/services/clientService.ts`, `src/server/actions/clients.ts`, `src/features/clients/`.

## 17. Catálogo

Tela em `/dashboard/catalog`, com produtos e serviços.

| Função | Quem | Regras |
|---|---|---|
| **Ver e usar nos orçamentos** | Owner, admin, member | Member vê nome e preço, sem custo nem margem. O técnico não acessa. Ao adicionar ao orçamento, o item leva o nome e a descrição ("Instalação de tomada — 2P+T 10A com caixa e fiação", até 300 caracteres), que dá para editar ali. |
| **Criar e editar** | Owner, admin | Tipo, nome, descrição, unidade, modo de preço (fechado ou por hora, só em serviços), preço, custo e ativo. Item inativo não aparece ao montar orçamentos. |
| **Excluir** | Owner, admin | Soft delete. Orçamentos guardam cópia dos valores e não mudam ao alterar ou excluir um item. |

O custo fica em uma tabela separada (`catalog_item_costs`), que só owner e admin leem.

Código: `src/services/catalogService.ts`, `src/server/actions/catalog.ts`, `src/features/catalog/`.

## 18. Orçamentos

Telas em `/dashboard/quotes`. O técnico não acessa.

**Lista:** filtro por situação (no celular, uma faixa que desliza para o lado) e busca por cliente (nome sem diferença de acento), número ("12", "0012" ou "#12") e palavra do título (`quotes.search_text`, coluna gerada). Busca e filtro continuam valendo ao trocar de página. Enviados mostram se o cliente já abriu o link ("Visto em 07/11" ou "Não aberto").

**Cliente abriu o link** (tabela `quote_views`, migration `20261107100000`): ao abrir o link de um orçamento que não é rascunho, o servidor grava a primeira e a última abertura e quantas vezes abriu, contando de novo só depois de 30 minutos (recarregar não soma). Não contam a própria empresa conferindo o link logada ("Ver como o cliente") nem robôs que montam a prévia quando o link é colado no WhatsApp ou em redes sociais. A página do orçamento diz "Visto pelo cliente em 07/11/2026 às 14:32" (e quantas vezes abriu) ou, enviado e nunca aberto, "O cliente ainda não abriu o link." Owner, admin e member veem; só o servidor grava (função `record_quote_view`, só com service_role). Falha ao gravar não impede o cliente de ver o orçamento. Isolamento testado em `supabase/tests/rls_test.sql`.

**Histórico** (na página do orçamento, owner, admin e member): tudo o que aconteceu com ele, do mais novo ao mais antigo, com data e hora no fuso da empresa e quem fez: a pessoa do escritório, o cliente pelo link ("Pelo cliente, no link", com o nome que ele informou) ou o sistema (vencimento automático da validade). Aprovação, recusa e cancelamento registrados pelo escritório mostram quem pediu e a observação ou motivo. Vem da auditoria, pela função `quote_history`, que só o escritório da própria empresa chama (migration `20261107130000`, testada em `supabase/tests/rls_test.sql`).

**Cálculo:** preço fechado = quantidade × preço; por hora = horas × pessoas (mínimo 1) × valor por hora. Arredonda só no fim de cada linha. Total = subtotal − desconto, nunca negativo. O banco recalcula ao salvar. Valores em centavos.

| De | Para | Quem | Regras |
|---|---|---|---|
| Rascunho | Enviado | Owner, admin, member | Exige cliente e ao menos 1 item. Sem validade, usa a padrão da empresa. Enviar pelo WhatsApp já marca como enviado. |
| Rascunho ou enviado | Recusado | Owner, admin, member, ou o cliente pelo link | Recusado é final. Pelo escritório, pede "Quem recusou" e aceita o motivo. |
| Enviado | Aprovado | Owner, admin, member, ou o cliente pelo link | Pode ser registrado à mão quando o cliente responde por telefone ou WhatsApp, sem abrir o link: pede "Quem autorizou" (obrigatório) e uma observação. |
| Enviado, aprovado ou expirado | Cancelado | Owner, admin, member | Para quando o serviço não vai mais acontecer, mesmo depois de aprovado. Pede "Quem pediu o cancelamento" e o motivo. Cancelado é final: sai do que está em andamento, o link mostra ao cliente que foi cancelado e "Duplicar" cria uma nova versão. Fechado não cancela: desfaça o fechamento antes. Pode ser excluído por owner e admin. |
| Enviado | Expirado | Owner, admin, member, ou o job | O job roda de hora em hora e usa o fuso da empresa. |
| Expirado | Rascunho | Owner, admin, member | Reabrir pede nova validade. |
| Aprovado | Fechado | Owner, admin | Pede valor (> 0), data de competência e como o cliente vai pagar; cria a receita e as parcelas a receber (seção 24). |
| Fechado | Aprovado | Owner, admin | "Desfazer fechamento" apaga a receita e as parcelas, inclusive as já recebidas. |

Outras regras:

- **Número** sequencial por empresa, gerado no banco, sem colisão.
- **Local do serviço:** cliente com um local só já vem com ele escolhido, ao trocar de cliente e ao abrir o orçamento pela tela do cliente.
- **Escolher o cliente:** com mais de 8 clientes, um campo "Filtrar por nome ou CPF/CNPJ" acima da lista reduz as opções, sem diferença de acento; com um só resultado e nenhum escolhido, ele já fica escolhido.
- **Desconto em R$ ou %:** o botão ao lado do campo troca o tipo (e limpa o valor). Em %, a tela mostra quanto dá em R$ sobre o subtotal, arredondado ao centavo, e é esse valor em R$ que vai para o banco, o PDF e o link. Acima de 100% passa do subtotal e o salvar recusa.
- **Só rascunho é editável.** Os demais são somente leitura e aparecem como um resumo compacto, como no PDF (título, cliente, local, validade, itens com quantidade e total, desconto, condições e observações); "Duplicar" cria um rascunho novo com número e link próprios.
- **Salvar** exige cliente, inclusive no primeiro rascunho ("Escolha o cliente."), e desconto até o subtotal ("O desconto não pode passar do subtotal (R$ X)."); campo de desconto apagado vale zero. A regra é a mesma no navegador e no servidor.
- **Alterações não salvas:** o editor mostra "Alterações não salvas" ao lado de "Salvar rascunho" e pede confirmação antes de sair da tela por um link ou de fechar ou recarregar a aba. Enviar, PDF e WhatsApp usam sempre o último salvo.
- **Excluir:** owner e admin, em rascunho, recusado, expirado ou cancelado. Enviado precisa antes ser recusado, cancelado ou expirado; aprovado e fechado não podem ser excluídos.
- **Limite do plano:** `max_quotes_month` vale ao criar e duplicar. Orçamentos excluídos continuam contando no mês. Acima do limite nada é apagado, e os rascunhos existentes seguem editáveis.
- **Custo, imposto, lucro e margem previstos** aparecem só para owner e admin e nunca vão para o PDF nem para o link. O custo de cada item vem do catálogo e pode ser trocado no orçamento. O imposto usa a alíquota de hoje da empresa (seção 25) sobre o total; sem regime informado, não entra e a tela avisa.
- **Valor a mais por item** (owner e admin, faixa "Só você vê", recolhida em "Valor a mais nesta linha" até ser usada; item com valor a mais já abre com ela): quando o valor unitário digitado é o que a empresa paga (a um parceiro, por exemplo), o campo "A mais nesta linha", em % sobre esse valor ou em R$ por unidade, forma o preço que o cliente vê. O cliente recebe só o preço final no PDF, no link e no WhatsApp. O valor digitado fica guardado como custo do item em `quote_item_costs`, que só owner e admin leem; ao reabrir, o "a mais" aparece em R$. A linha mostra quanto a empresa ganha. Sem "a mais", vale o custo do catálogo. Quando o membro edita o rascunho, ele vê só o preço final e o custo continua. Duplicar leva os custos.
- **PDF** gerado no navegador (`jspdf`), para baixar ou imprimir. O bloco "Para" traz nome e CPF/CNPJ do cliente, telefone e e-mail do contato principal e o local do serviço, no PDF do escritório e no baixado pelo link (função `get_public_quote`, migration `20261107120000`). "Imprimir" abre o PDF numa aba já pedindo a impressão; no celular e no tablet, baixa o arquivo, que se imprime pelo leitor de PDF. **WhatsApp** por link `wa.me`, sem provedor, para o contato principal. "Copiar texto" no rascunho copia a mensagem sem o link de aprovação, que só abre depois de enviado, e avisa isso; enviado, copia com o link. Quando o telefone do contato principal é fixo (DDD + 8 dígitos começando de 2 a 5), um aviso ao lado do botão diz que ele pode não ter WhatsApp e sugere copiar o texto ou cadastrar um celular.
- **Condições de pagamento** (no editor, quem edita orçamentos): a combinar, à vista (com a forma), entrada + parcelas (entrada e forma, restante em N vezes e forma) ou cartão parcelado (N vezes). A tela mostra o texto que o cliente vê, por exemplo "Entrada de R$ 500,00 no PIX e o restante em 2x de R$ 500,00 no boleto". Quando os centavos não dividem, eles ficam na primeira parcela, como no fechamento, e o texto mostra isso para a soma bater: "3x (1x de R$ 286,68 e 2x de R$ 286,66)". Aparece no link, no PDF e na mensagem do WhatsApp. Só muda em rascunho; duplicar leva junto. Ao fechar o serviço, o plano de pagamento já vem com o combinado, com as datas contadas a partir do fechamento.
- **Dados para orçamentos** (Configurações, owner e admin): CNPJ, telefone, e-mail, endereço, validade padrão, observações padrão, fuso e meta de margem. **Logo** da empresa no mesmo lugar (e, opcional, no último passo do cadastro): PNG, JPG ou WebP, reduzido no aparelho e convertido para PNG (fundo transparente mantido), até 500 KB; envia assim que escolhido, com prévia, "Trocar logo" e "Remover". Aparece no topo do PDF do orçamento, do link de aprovação, do PDF da ordem de serviço (numa caixa branca sobre a faixa escura) e do recibo; sem logo, os documentos ficam como antes. Fica no bucket público `company-logos` (`<company_id>/<uuid>.png`, nome novo a cada troca, o antigo é apagado), gravado só pelo servidor depois de conferir o papel; o banco só aceita caminho da pasta da própria empresa. Trocar e remover entram na auditoria. O imposto fica em Configurações › Impostos (seção 25). A leitura do perfil é restrita pela RLS ao escritório (owner, admin e member); o técnico recebe só o subconjunto de contato (CNPJ, telefone, e-mail, endereço, logo, fuso, validade e observações padrão), via função no banco, para montar a ordem de serviço — sem ver regime, alíquota, taxas do cartão nem meta de margem.

**Link de aprovação** (`/orcamento/[token]`, recurso `public_approval` do plano):

- Sem login, com token aleatório próprio de 256 bits, nunca o id do orçamento. Rascunho não abre.
- Mostra só o que o cliente precisa ver e permite baixar o PDF.
- Aceita resposta apenas com status enviado e dentro da validade, uma única vez. Exige nome, e motivo na recusa.
- **Aprovar exige assinatura**, feita com o dedo ou o mouse no mesmo quadro da ordem de serviço. O servidor confere que é uma imagem PNG de até 900 KB e grava no bucket privado `quote-signatures`, na pasta do orçamento; o banco recusa aprovação sem assinatura ou com arquivo de outra pasta. Recusar não pede assinatura. Só o escritório da empresa (owner, admin e member) abre a assinatura, por link temporário de 1 hora: ela aparece na resposta, na página do orçamento, e no PDF baixado de lá.
- **Depois de aprovar**, o link mostra ao cliente a assinatura, o nome, a data e a observação dele, com "Baixar PDF" e "Imprimir". O PDF, do link e do escritório, termina com o bloco "Aprovação do cliente": assinatura, nome, data e observação. No link, a assinatura abre por link temporário gerado pelo servidor só para a pasta do próprio orçamento.
- Rate limit por IP: 10 respostas a cada 10 minutos e 60 visualizações por minuto. A escrita passa pelo servidor.
- A resposta aparece no orçamento e entra na auditoria.
- **Aviso por e-mail:** quando o cliente aprova ou recusa pelo link, o proprietário e os administradores da empresa recebem um e-mail, um para cada um, com quem respondeu, o valor, a observação ou o motivo e o link para o orçamento ("Cerâmica Vale Verde aprovou o orçamento Nº 0012"). O que o cliente digita é escapado no HTML. Falha no envio não desfaz a resposta: vai só para o monitoramento de erros. Sai pelo provedor de e-mail configurado (`EMAIL_PROVIDER`): no modo `console`, só aparece no log do servidor; com `resend`, envia de verdade.

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
- **Atrasada:** visita agendada cujo horário já passou e que não começou aparece como "Atrasada" (em vermelho) na agenda, no Início e em Minhas visitas, em vez de "Agendada"/"Próxima". É só a forma de mostrar; a situação guardada continua "agendada" até alguém iniciar, concluir ou cancelar.
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
| **Resumo do mês** | Faturado, recebido, gastos e caixa do mês, com a variação sobre o mês anterior. **Faturado** é o que foi vendido; **recebido**, o dinheiro que entrou; **caixa**, recebido − gastos (pode ficar negativo). O resultado pelo faturado (faturado − gastos) aparece junto do caixa. |
| **Faturado** | Vem só de orçamentos fechados, na data de competência. Desfazer o fechamento tira o valor. É a base do resultado do serviço, da margem e do imposto. |
| **Como o cliente paga** (no fechamento) | À vista (forma e se já foi recebido), entrada + parcelas (valor e forma da entrada, restante em N vezes mês a mês a partir de uma data, com a forma), cartão parcelado (N parcelas no crédito, a receber a partir do primeiro repasse) ou personalizado (cada parcela com valor, vencimento, forma e se já foi recebida). Os centavos que sobram da divisão vão na primeira parcela. As parcelas precisam somar o valor fechado, conferido na tela e no banco; até 60. Parcela marcada como recebida entra no caixa no vencimento, sem passar de hoje. |
| **Contas a receber** (cartão no Financeiro e `/dashboard/finance/recebimentos`) | No Financeiro: total a receber, atrasado e as parcelas atrasadas ou que vencem em 30 dias. Na página: a receber, atrasado e em 7 dias, a lista "A receber" (da mais antiga para a mais nova) e "Recebidos" por mês. Cada parcela mostra o orçamento, o cliente, a forma e a situação (atrasada há N dias, vence hoje, vence em, recebida em). Na página do orçamento fechado, "Recebimentos" mostra as parcelas dele e quanto já entrou. |
| **Registrar recebimento** | **Com um toque:** "Dar baixa" registra o valor esperado (já sem a taxa do cartão), com a data de hoje e a forma combinada, e o aviso traz "Desfazer". **Recebeu diferente?** (ícone ao lado) abre o formulário completo: data (até hoje, no fuso da empresa), valor e forma. Valor menor que a parcela deixa o restante como parcela nova a receber, na data escolhida. Dá para desfazer a baixa e para mudar vencimento e forma de uma parcela a receber; o valor não muda, porque a soma é o faturado. Tudo entra na auditoria. |
| **Taxa da maquininha** (Configurações › Impostos e taxas) | Crédito e débito em %, de 0 a 20. Cada parcela no crédito ou no débito leva a taxa no fechamento: o caixa recebe o valor sem ela, e a taxa entra como custo do serviço ("Taxa do cartão") no resultado e na margem. A tela de fechamento mostra a taxa de cada parcela e quanto entra no caixa. Mudar a forma de uma parcela a receber recalcula a taxa; na baixa, o valor sugerido já vem sem ela, e receber diferente ajusta a taxa (a mais) ou deixa o restante a receber (a menos). Mudar a taxa vale para os próximos fechamentos. A receber e atrasado já são mostrados sem a taxa. |
| **Recibo** | Nas parcelas recebidas (Contas a receber › Recebidos, e no orçamento fechado), "Recibo" gera o PDF: dados da empresa, Recibo Nº <orçamento>-<parcela>, "Recebemos de <cliente>, CNPJ/CPF, a importância de R$ X (valor por extenso), referente ao pagamento da parcela i de n do orçamento Nº … (título), recebida em <data>, por <forma>", e a linha de assinatura com o nome e o CNPJ da empresa. No celular, abre o compartilhar do aparelho com o PDF anexado (WhatsApp, e-mail); no computador, baixa o arquivo. Só owner e admin, e só de parcela recebida. |
| **Lembrete de cobrança** | Nas parcelas a receber, o botão do WhatsApp abre a conversa com o contato principal do cliente e uma mensagem pronta, com o valor, o orçamento e o vencimento (ou "que venceu em"). Sem provedor: é um link `wa.me`. Na demonstração, abre o número comercial. |
| **No cliente** | A ficha do cliente mostra "A receber deste cliente": o total, o atrasado e as parcelas, com baixa e lembrete. Só owner e admin. |
| **Serviços fechados antes** | Viraram uma parcela única, recebida na data de competência: nenhum valor mudou. |
| **Últimos 6 meses** | Gráfico de faturado, recebido e gastos e, logo abaixo, "Mês a mês" com faturado, recebido, gastos e caixa de cada mês (do mais recente ao mais antigo; tocar no mês abre esse mês). No computador fica sempre aberto; no celular, recolhido em "Ver mês a mês". |
| **Próximas 4 semanas** (fluxo de caixa) | A partir de hoje, semana a semana: entra o que vence das parcelas a receber (já sem a taxa do cartão), sai o que está lançado com data de hoje em diante e as recorrências dos meses ainda não gerados. Mostra o que entra, o que sai, o resultado da semana e o acumulado, mais o total das 4 semanas. Não conta o saldo que já está no banco, e diz isso. O atrasado fica fora das semanas, citado à parte; se o acumulado fica negativo, avisa até quando sai mais do que entra. |
| **Gastos por categoria** | Só do mês escolhido, da maior para a menor. |
| **Previsão** | Aprovados a fechar e enviados aguardando resposta. Fica separada e não entra no saldo. |
| **Listas** | Orçamentos fechados e lançamentos de gasto do mês. |

Só owner e admin leem as parcelas (`receivables`) e dão baixa; a escrita é pelas funções do banco. Testes em `supabase/tests/security_regression_test.sql` (bloco "Recebimentos"), `src/lib/installments.test.ts` e `src/services/receivableService.test.ts`.

Código: `src/services/financeService.ts`, `src/services/receivableService.ts`, `src/lib/installments.ts`, `src/app/dashboard/finance/`.

## 25. Custos e resultado por serviço

Para orçamentos aprovados ou fechados. Só owner e admin: membro e técnico não veem custos nem margem.

| Função | Regras |
|---|---|
| **Serviços** (`/dashboard/services`, logo abaixo de Início e aba fixa no celular) | Em andamento (aprovados) e Concluídos (fechados). Cada serviço mostra visitas feitas, a próxima visita e, para owner e admin, cobrado, custos, resultado e margem, com "Lançar gasto" e "Concluir e faturar". Alerta quando o custo passa do previsto ou a margem fica abaixo da meta. O membro vê o andamento, sem valores. |
| **Custos do serviço** (na página do orçamento) | Valor cobrado, custos e imposto, e resultado, com a **margem realizada** (sobre o que já foi gasto) ao lado da **prevista** no orçamento (custo previsto mais imposto, a mesma da lateral do editor) e da meta da empresa: verde na meta ou acima, laranja abaixo, vermelho no prejuízo. Sem gasto nem hora lançados, diz isso em vez de mostrar 100%. O relatório em PDF e a lista de Serviços também dizem "margem realizada". |
| **Imposto estimado** | Alíquota sobre o valor cobrado, descontada do resultado e mostrada como categoria de custo. Vem do padrão da empresa e fica gravada no orçamento quando ele é aprovado (pela tela ou pelo link): mudar o padrão depois não mexe em serviço já aprovado. Owner e admin podem trocar a alíquota de um serviço aprovado ou fechado ("Alterar alíquota"), de 0 a 40% com até duas casas; a troca entra na auditoria. Orçamentos aprovados antes desta função seguem o padrão atual da empresa até alguém definir a alíquota deles. |
| **Impostos** (Configurações › Impostos e taxas, `/dashboard/settings/impostos`, owner e admin) | Regime: não informado, MEI, Simples Nacional ou outro. Sem regime, o resultado não desconta imposto e o serviço mostra o aviso. No MEI a alíquota é zero: o DAS mensal fixo entra como gasto recorrente. Em outro regime, a alíquota é informada em %. No Simples Nacional, a empresa escolhe entre informar a alíquota (a efetiva que o contador passa) e calculá-la pelo faturamento. Mudanças entram na auditoria, sem os valores de faturamento. |
| **Cálculo pelo faturamento (RBT12)** | Opcional, só no Simples Nacional, com o anexo escolhido: III (a maior parte dos serviços), IV (construção civil, limpeza, vigilância) ou V (serviços técnicos e intelectuais). Todo mês, soma o faturamento dos 12 meses anteriores e aplica (RBT12 × alíquota nominal da faixa − parcela a deduzir) ÷ RBT12, pelas tabelas da LC 123/2006. Anexo V com folha de 28% ou mais do faturamento (Fator R, marcado pela empresa) usa o Anexo III. Com menos de 12 meses desde o início das atividades (opcional), usa a média dos meses × 12; no primeiro mês, a primeira faixa. Acima de R$ 4,8 milhões, fica na última faixa e a tela avisa que a empresa passou do teto. **Regime de caixa** (opcional, para quem optou com o contador): o mês conta o que foi recebido (com a taxa do cartão, que o cliente pagou), em vez do faturado; a coluna dos 12 meses passa a se chamar "Recebido". A tela mostra a conta passo a passo e, no modo informado, a alíquota que o cálculo daria como sugestão. A conta é feita no banco, e é ela que fica gravada ao aprovar, inclusive pelo link do cliente. |
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
| **Nada é salvo** | Formulários abrem e botões continuam visíveis. Ao salvar, aparece "Na demonstração não é possível salvar". Fotos, assinaturas, logo e pagamento também são recusados. |
| **Dados** | Empresa fictícia em `src/server/demo/fixtures.json`, com logo fictício servido pelo próprio site (`public/demo/logo-refrigeracao-exemplo.png`). As datas são recalculadas para perto de hoje, sem rotina nem escrita. |
| **Perfis** | Escritório, com visão de proprietário, ou técnico, com as próprias visitas e a ordem de serviço. |
| **Saída** | "Sair", ir para outra página do site ou criar conta encerra a demonstração. Sem uso, o cookie expira em 2 horas. |
| **Fora da demonstração** | Painel de planos, revendedores e demais áreas fora de `/dashboard` redirecionam para o início da demonstração. |

Um cookie falso não dá acesso a nada: ele só faz o servidor entregar os dados fictícios.

## 27. Prevenção de fraude e comprovantes

Para dificultar que alguém cadastre uma empresa que não é dela e para guardar prova do que aconteceu.
Nada aqui atrapalha quem é honesto: a declaração é um clique e a conferência do CNPJ só sinaliza.

| Função | Como funciona | Regras |
|---|---|---|
| **Declaração de responsabilidade** | Obrigatória no último passo do cadastro e em "Nova empresa": "Declaro que sou responsável por esta empresa ou estou autorizado por ela a usar o MeuNegócio em seu nome, e que os dados informados são verdadeiros." | Sem marcar, a empresa não é criada nem concluída. Guardada em `company_declarations` com o texto exato, nome e e-mail de quem declarou, empresa e CNPJ da hora, versão dos termos, IP e navegador. Empresas criadas pelo super admin não têm declaração. |
| **CNPJ válido** | O CNPJ dos dados da empresa precisa ter os dígitos verificadores certos ("CNPJ inválido. Confira os números."). | Vale no cadastro e em Configurações. |
| **Conferência na base pública** | No cadastro com CNPJ e a cada troca de CNPJ, consulta a base pública da Receita (BrasilAPI) e guarda em `company_cnpj_checks`: CNPJ confere, nome não confere, CNPJ não ativo, CNPJ não existe ou consulta indisponível; razão social, nome fantasia, situação, abertura e município; e se o nome de quem declarou aparece no quadro de sócios (primeiro e último nome). | Não bloqueia: só sinaliza. A lista de sócios não é guardada, só o sim ou não. Falha da base fica como "indisponível" e não impede o cadastro. |
| **Denúncia** (`/denunciar`) | Sem login: motivo (se passa por outra empresa, cobrança suspeita, outro), relato, nome opcional e contato. Vinda do link de um orçamento ("Denunciar uso indevido" no fim da página), já leva a empresa e o orçamento. O suporte (`brand.legal.supportEmail`) recebe um aviso por e-mail. | 5 por hora por endereço de rede e campo escondido contra robôs. Guardada em `abuse_reports` com IP e navegador. Na demonstração, é recusada. |
| **Sinais em `/admin/empresas`** | Cada empresa mostra: suspensa, resultado da última conferência do CNPJ quando não confere, "Fora do quadro de sócios" e o número de denúncias. O nome abre os comprovantes. | Só super admin. |
| **Denúncias** (`/admin/denuncias`) | As 100 mais recentes, com motivo, relato, contato e IP, ligadas à empresa. | Só super admin. |
| **Comprovantes da empresa** (`/admin/empresas/[id]`) | Dados da empresa, declarações, conferências do CNPJ, denúncias e histórico de suspensão. "Imprimir ou salvar em PDF" imprime só o conteúdo, com a data em que foi gerado. | Só super admin. |
| **Suspender e reativar** | Na página de comprovantes, com motivo obrigatório. Suspensa, a empresa não abre nenhuma tela do painel (vai para `/empresa-suspensa`, que mostra o contato do suporte sem citar o motivo), as ações do servidor recusam e os links de orçamento dela deixam de abrir (404). Os dados ficam guardados. | Cada suspensão e reativação vai para `company_suspension_events` (quem, quando, motivo) e para a auditoria da empresa. A empresa não consegue se reativar pela API. |

**Prova guardada.** As quatro tabelas só recebem linhas novas, gravadas pelo servidor: ninguém edita
nem apaga pela aplicação, e só o super admin lê. Cada linha guarda cópia dos dados da hora (nome,
e-mail, empresa), então continua valendo mesmo se a conta for excluída. Não há exclusão automática.

**Termos.** A versão 2 dos Termos (migration `20261106140000`) acrescenta "Uso em nome de uma
empresa": proíbe usar nome, CNPJ ou logo de terceiros e prevê a suspensão. Quem aceitou a versão 1
aceita de novo no próximo acesso.

**Ainda não feito:** confirmação do e-mail no cadastro (depende do envio de e-mail configurado) e
CPF ou CNPJ do pagador na assinatura (junto com a validação do Asaas no sandbox).

