/**
 * Identidade do produto — ÚNICO lugar a editar ao clonar o starter.
 * A cor primária fica nos tokens CSS em src/app/globals.css (--primary).
 */
export const brand = {
  /** Nome exibido na LP, título das páginas e sidebar. */
  name: "MeuNegócio",
  /** Descrição curta usada em metadata e na LP. */
  tagline: "Visitas, orçamentos e caixa da sua empresa de serviços",
  /** Domínio público (links de email usam APP_URL do servidor). */
  url: "https://meuproduto.com.br",
  /**
   * Dados legais exibidos no rodapé e nas páginas de política (Decreto 7.962/2013).
   * PLACEHOLDERS — preencha com os dados reais antes de ir para produção.
   */
  legal: {
    companyName: "Minha Empresa Ltda.",
    cnpj: "00.000.000/0000-00",
    address: "Rua, nº — Cidade/UF — CEP",
    supportEmail: "suporte@meuproduto.com.br",
    /** Encarregado de dados (DPO) — canal para direitos do titular (LGPD, art. 41). */
    dpoEmail: "privacidade@meuproduto.com.br",
  },
} as const;
