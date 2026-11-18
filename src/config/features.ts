/**
 * Flags de produto por build. Desligar esconde a funcionalidade em toda a
 * interface do usuário, mantendo o código, as migrations e os dados para
 * reativar depois só trocando o valor para `true`.
 */

/**
 * Imposto estimado por serviço: regime/alíquota da empresa, cálculo pelo RBT12
 * do Simples e o imposto descontado do resultado de cada serviço.
 *
 * Desligado por enquanto — não mostramos esse cálculo ao usuário. Enquanto
 * `false`: nenhuma tela exibe imposto e o resultado dos serviços não o desconta.
 * A taxa da maquininha é outra coisa e continua ativa.
 */
export const TAX_UI_ENABLED = false;

/**
 * "Nova empresa" no seletor de empresas do painel (cria outra empresa para o próprio usuário).
 *
 * Desligado por enquanto: o item some do menu. A criação de empresa pelo super admin
 * (`/admin/empresas`) e o cadastro em etapas (`/comecar`) continuam funcionando. Religar é só
 * trocar para `true`.
 */
export const NEW_COMPANY_MENU_ENABLED = false;
