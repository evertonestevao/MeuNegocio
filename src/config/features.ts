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
