Vamos criar um novo produto SaaS a partir deste starter kit. Leia antes CLAUDE.md,
FUNCIONALIDADES.md e DOCUMENTACAO.md (seção 6.2) e siga as regras de arquitetura deles.

O protótipo do produto está publicado em https://gerenciaeverapps.vercel.app/ (React + Vite, sem servidor,
dados em localStorage; qualquer e-mail e senha entram). O código-fonte não está disponível.
Use-o como referência de telas, fluxos, regras e mensagens em português. Não copie CSS nem
componentes: aqui a UI usa os componentes do kit e os dados seguem
componentes → hooks → services → repositories → Supabase. As regras de cálculo são reescritas com testes
e também valem no servidor.
Quando este prompt e o protótipo divergirem, vale este prompt.

## O produto
- Nome: [MeuNegócio]
- Tagline (1 frase): [Visitas, orçamentos e caixa da sua empresa de serviços]
- Domínio: [https://meuproduto.com.br]
- Público: [pequenas empresas de prestação de serviços com visita técnica e equipe em campo, de 2 a 20 pessoas]
- Problema principal: [A empresa controla visitas, orçamentos, horas de prestadores e gastos em WhatsApp,
  caderno e planilha. Orçamentos se perdem sem resposta, técnicos são escalados em horários conflitantes
  e o dono não sabe quanto sobrou no mês.]
- Cor primária da marca: [#14202e]

### O nome tem que ser editável
"MeuNegócio" é provisório e será trocado. Trocar o nome deve exigir editar só `src/config/brand.ts`.
- Todo texto, título, metadata, e-mail, PDF e manifest do PWA lê o nome de `brand`.
- O nome não entra em chaves de storage, nomes de cookie, tabelas, rotas nem no `package.json` sem necessidade.
- Crie um teste que falhe se o nome literal aparecer em `src/` fora de `brand.ts`.
- Esse é o nome do produto. O nome da empresa cliente é outro dado: cada empresa edita o seu em Configurações
  (ver módulo 1), e é ele que aparece no PDF e no link de aprovação.

## Dados legais (rodapé e políticas)
- Razão social: [Minha Empresa Ltda.]
- CNPJ: [00.000.000/0000-00]
- Endereço: [Rua, nº — Cidade/UF — CEP]
- Email de suporte: [suporte@meuproduto.com.br]
- Email do encarregado de dados (DPO): [privacidade@meuproduto.com.br]

## Papéis
Mantenha owner, admin e member, e crie o papel `technician` (migration em `roles` + `defineRole()`).

| Área | owner / admin | member (escritório) | technician (campo) |
|---|---|---|---|
| Agenda | tudo | tudo | só as próprias visitas, sem editar |
| Clientes | tudo | ver, criar, editar | só cliente, contato e local das próprias visitas |
| Catálogo | tudo, com custo e margem | ver e usar, sem custo e margem | nada |
| Equipe | tudo, com dados de pagamento | só nome, função e ativo | nada |
| Orçamentos | tudo, inclusive fechar | criar, editar e enviar; não fecha nem desfaz | nada |
| Ordem de serviço | ver todas | ver todas | preencher as próprias |
| Horas, Gastos, Financeiro | tudo | nada | nada |
| Configurações da empresa | editar | nada | nada |

Só owner e admin apagam registros. RLS filtra linhas, não colunas: guarde custo do catálogo e dados de
pagamento da equipe em tabelas separadas (ex.: `catalog_item_costs`, `employee_payment_details`), acessíveis só
a owner e admin. A restrição vale no banco e no service, não só no menu.

## Módulos de negócio (o que é novo)
Em todos: valores em centavos (inteiros), mensagens de erro em português como no protótipo, e os dados são
isolados por `company_id`. Datas de visita e horas são data + hora local da empresa.

1. Empresa (configurações)
   - Campos: nome, CNPJ, telefone, e-mail, endereço, validade padrão do orçamento (dias, mín. 1),
     observações padrão, fuso (padrão America/Sao_Paulo).
   - Permissões: owner e admin editam.
   - Regras: preenchido no onboarding. A empresa nova começa sem dados de exemplo, só com as categorias de gasto
     padrão, entre elas a de prestadores, usada no pagamento de horas.

2. Clientes
   - Campos: nome, documento, observações; contatos (nome, função, telefone, e-mail, principal);
     locais de atendimento (nome, endereço completo, observações).
   - Regras: um único contato principal por cliente. Cliente com orçamento ou visita não pode ser excluído.
   - Tela: lista e detalhe com histórico de orçamentos e visitas.

3. Catálogo
   - Campos: tipo (produto/serviço), nome, descrição, unidade, modo de preço (fechado/por hora), preço, custo, ativo.
   - Regras: orçamentos guardam cópia dos valores, então alterar ou excluir um item não muda orçamentos existentes.
     Margem visível só para owner e admin.

4. Equipe
   - Campos: nome, função, telefone, ativo, contrato (CLT/PJ/autônomo); dados de pagamento: custo/hora, valor/hora,
     razão social, CPF/CNPJ, Pix; usuário vinculado (opcional).
   - Regras: quem aparece em visita, gasto ou hora não é excluído, só desativado. Nem toda pessoa da equipe tem login:
     o vínculo com usuário é opcional e é o que dá acesso de técnico às próprias visitas.
   - Tela: próximas visitas de cada pessoa.

5. Agenda
   - Campos: cliente, local, tipo (visita técnica/execução), data, início, fim, status
     (agendada/em andamento/concluída/cancelada), orçamento opcional, funcionários (N:N), observações.
   - Regras: exige cliente, local, data, fim depois do início e ao menos 1 funcionário ativo. A mesma pessoa não pode
     estar em duas visitas ativas (agendada/em andamento) com horário sobreposto: avise ao vivo no formulário e bloqueie
     no banco, à prova de dois usuários salvando ao mesmo tempo, ignorando registros com `deleted_at`.
   - Tela: abre na visão de mês; também tem semana.

6. Orçamentos
   - Campos: número, cliente, local, título, status, validade, desconto, observações, datas de envio, aprovação, recusa
     e fechamento; itens (item do catálogo opcional, descrição, unidade, modo, quantidade/horas, pessoas, valor unitário);
     resposta do cliente (decisão, nome, comentário, data).
   - Cálculo: fechado = quantidade × preço; por hora = horas × pessoas (mín. 1) × valor/hora; arredonda só no fim da
     linha; total = subtotal − desconto, nunca negativo.
   - Status: rascunho → enviado/recusado; enviado → aprovado/recusado/expirado; aprovado → fechado; expirado → rascunho
     (reabrir, com nova validade). Recusado é final. Fechado só sai por "desfazer fechamento".
   - Regras: número sequencial por empresa, gerado no banco sem colisão. Só rascunho é editável. Para enviar: cliente e
     ao menos 1 item. Fechar pede valor (> 0) e data de competência e cria a receita; desfazer apaga a receita e volta
     para aprovado. Aprovado ou fechado não pode ser excluído. Duplicar cria rascunho novo.
     Enviado com validade vencida expira por job diário, não só ao abrir a tela.
   - PDF do orçamento e envio por WhatsApp via link `wa.me` (sem provedor).
   - Link público de aprovação: rota sem login, com token aleatório próprio (nunca o id do orçamento). Mostra só o que o
     cliente precisa ver. Aceita resposta apenas com status enviado e dentro da validade; exige nome, e motivo na recusa.
     Tem rate limit e a escrita passa pelo servidor. A resposta aparece no orçamento.

7. Ordem de serviço (app do técnico, tela para celular)
   - Campos: checklist, fotos com legenda, relatório, início e fim reais, assinatura (imagem, nome, data).
   - Regras: "cheguei" põe a visita em andamento e cria a OS com checklist padrão por tipo de visita (listas em `calc.ts`).
     Concluir exige assinatura e nome de quem assinou, e fim depois do início; a visita vira concluída, a OS não muda mais
     e são gerados apontamentos pendentes para a equipe da visita, sem duplicar.
   - Fotos e assinatura ficam em bucket privado com policies por empresa, via `StorageProvider`, nunca como data URL no banco.
     Comprima a foto no navegador. Inclui PDF da OS.

8. Horas
   - Campos: pessoa, data, entrada, saída, intervalo, visita e cliente opcionais, observações,
     status (pendente/aprovado/pago), gasto gerado.
   - Regras: visitas até hoje e não canceladas sugerem horas (usando os horários reais da OS, quando houver), com intervalo
     padrão de 1 h em jornadas acima de 6 h. Permite ajustar, retirar, restaurar e lançar hora avulsa. Sem sobreposição por
     pessoa no mesmo dia. Pago não muda nem é excluído. Fechar o mês de PJ/autônomo paga o que está na lista, lança um gasto
     e marca como pago; excluir esse gasto reabre as horas. CLT não fecha horas: recebe por recorrência.
   - O registro serve para gestão e pagamento de prestadores e não substitui ponto eletrônico de CLT: diga isso na tela.

9. Gastos
   - Campos: descrição, categoria, valor, data, tipo (recorrente/pontual/folha/prestador), funcionário, modelo de origem,
     observações; modelos de recorrência (dia 1–28, início, fim, ativo, funcionário opcional).
   - Regras: cada modelo gera 1 lançamento por mês, com chave única (modelo, mês), por job mensal idempotente, respeitando
     início e fim e sem gerar mês futuro. Modelo com funcionário gera folha. Excluir um modelo mantém o que já foi gerado.
     Categoria em uso não pode ser excluída.
   - Tela: abre no calendário; também tem lista.

10. Financeiro e início
    - Financeiro: faturamento × gastos × saldo do mês, gráfico de 6 meses e gastos por categoria, com `src/components/charts`.
      A previsão (enviados + aprovados não fechados) aparece separada e não entra no saldo.
    - Início: cartões de visitas de hoje, em negociação, saldo do mês e vencendo em 7 dias; visitas de hoje e amanhã;
      orçamentos aguardando resposta e aprovados por fechar. Cada papel só vê o que tem permissão de ver:
      member não vê saldo nem gastos, e technician vê só as próprias visitas.

## Planos
Os limites valem no service (`canAccessFeature`/`getFeatureLimit`). Técnico com login conta como membro; pessoa da equipe sem
login não conta.

| Plano | Preço/mês | Membros inclusos | Membro extra | Limites e recursos do produto |
|---|---|---|---|---|
| [Free] | [R$ 0] | [2] | [—] | [`max_clients` 30, `max_quotes_month` 20; sem `public_approval`, `work_orders` e `hours`] |
| [Pro] | [R$ 149] | [10] | [R$ 19,90] | [clientes e orçamentos ilimitados, link de aprovação, ordem de serviço, horas] |
| [Enterprise] | [R$ 599] | [50] | [R$ 29,90] | [tudo do Pro, com mais membros] |

Esta tabela é só o seed inicial. Depois de aplicada, quem manda nos planos é o super_admin, sem migration nem deploy.

### Painel de planos (`/admin/planos`)
- Acesso: só super_admin (`public.platform_admins`), revalidado no servidor em toda tela e action, como em
  `/admin/revendedores`. Validação com Zod no client e no server. A escrita em `plans` passa pelo servidor com
  service_role, em `src/server`; não crie policy de escrita para o client.
- Pode: criar plano, editar nome, preço, membros inclusos, preço do membro extra, limites e recursos, ativar e desativar.
- `code` não muda depois de criado. Plano com assinatura não é excluído, só desativado: some da oferta e quem já assina
  continua nele.
- Limites e recursos: o painel edita valores de uma lista fechada de chaves definida no código (`max_clients`,
  `max_quotes_month`, `public_approval`, `work_orders`, `hours` etc.), com tipo validado. Chave nova exige código,
  porque nada a checaria. Ilimitado usa a mesma representação que `getFeatureLimit` já entende.
- Toda alteração entra na auditoria, com quem alterou, valor anterior e valor novo.

### Efeito de uma alteração
- Nenhum preço, limite ou nome de plano fica fixo no código: landing, billing e checagens leem de `plans`. Crie um teste
  que falhe se o valor de um plano aparecer literal em `src/`.
- Preço novo vale para novas assinaturas. Quem já assina mantém o valor contratado: hoje `billingService` calcula a
  cobrança de seats com o `price_cents` atual do plano, então editar o preço mudaria a assinatura antiga no próximo
  convite. Guarde em `subscriptions` o preço base e o do membro extra contratados e cobre a partir deles.
- Limites e recursos valem na hora para todas as empresas do plano. Se o limite baixar, nada é apagado: a empresa acima
  do limite mantém os dados e só fica impedida de criar novos registros, com mensagem clara.
- O Stripe cobra pelo catálogo `PAYMENT_PRICE_*`, não pelo banco: com esse gateway ativo, o painel avisa que o preço também
  precisa ser alterado lá. O módulo de revendedores não muda: os planos mantêm o `id`.
- Essa mudança em `billingService` e `subscriptions` mexe na fundação: mostre antes de aplicar. Atualize em DOCUMENTACAO.md
  a descrição de `plans` como "gerido por migration".

## Integrações
- Pagamento: Asaas (já pronto: PIX, boleto, cartão).
- Email: Resend (já pronto).
- WhatsApp: só link `wa.me` nesta etapa, sem `NotificationProvider`.
- PDF: gerado no navegador com `jspdf` e `jspdf-autotable`, como no protótipo. São dependências novas: confirme comigo
  ao chegar nessa fase.
- Jobs agendados (expirar orçamentos, gerar recorrências): proponha o mecanismo no plano, sem service_role no client.

## Landing page
A landing fica em `src/app/page.tsx` (este kit não tem `src/features/marketing/content.ts`). Reescreva para o produto:
proposta, dores, benefícios, planos (lidos de `plans`, só os ativos) e FAQ. Remova as seções sobre o starter kit.
Não invente depoimentos, números ou promessas que o produto não cumpre.

Adapte `/privacy` e `/refund` ao produto: dados de clientes, fotos e assinaturas coletados em campo, e os provedores usados.
Mantenha o aviso de texto de exemplo até a revisão jurídica.

## Fora do escopo agora
Nota fiscal, WhatsApp automático, envio do orçamento por e-mail, app nativo, uso offline do técnico, i18n, API pública,
ponto eletrônico de CLT, módulo de revendedores (não mexer) e, do protótipo, faixa de demonstração, lista de espera,
"restaurar exemplo" e "apagar tudo".

## Como trabalhar
1. Primeiro, me mostre um plano dividido em fases (identidade → planos → papéis → um módulo por vez, na ordem acima
   → landing e textos legais → testes E2E), com as tabelas e migrations que vai criar.
2. Execute uma fase por vez, com testes, e pare para eu revisar ao fim de cada uma.
3. Toda tabela nova: company_id, deleted_at, RLS, policies e GRANTs na mesma migration,
   mais o bloco de teste em supabase/tests/rls_test.sql, incluindo os casos de papel (member não lê custo e
   pagamentos; technician não lê visita de outra pessoa).
4. Escreva testes das regras observadas no protótipo nos services correspondentes.
5. Atualize FUNCIONALIDADES.md a cada módulo entregue.
6. Pergunte antes de adicionar dependência nova ou de mexer na fundação
   (auth, tenant, errors, proxy, adapters existentes). A rota pública de aprovação pode exigir liberação no proxy:
   mostre a mudança antes de aplicar.
