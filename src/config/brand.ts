/**
 * Identidade do produto — ÚNICO lugar a editar ao clonar o starter.
 * A cor primária fica nos tokens CSS em src/app/globals.css (--primary).
 */
export const brand = {
  /** Nome exibido na LP, título das páginas e sidebar. */
  name: "NegocioApp",
  /** Descrição curta usada em metadata e na LP. */
  tagline: "Visitas, orçamentos e caixa da sua empresa de serviços",
  /** WhatsApp comercial, só dígitos e com DDI: destino de "Quero contratar". */
  salesWhatsapp: "5514997122258",
  /** Domínio público (links de email usam APP_URL do servidor). */
  url: "https://negocioapp.com.br",
  /**
   * Dados legais exibidos no rodapé e nas páginas de política (Decreto 7.962/2013).
   * companyName e address ainda são PLACEHOLDERS — preencha a razão social e o
   * endereço reais do CNPJ antes de ir para produção.
   */
  legal: {
    companyName: "Minha Empresa Ltda.",
    cnpj: "70.103.001/0001-47",
    address: "Rua, nº — Cidade/UF — CEP",
    supportEmail: "suporte@negocioapp.com.br",
    /** Encarregado de dados (DPO) — canal para direitos do titular (LGPD, art. 41). */
    dpoEmail: "privacidade@negocioapp.com.br",
  },
} as const;

/** Link do WhatsApp comercial, com a mensagem já escrita. */
export function salesWhatsappHref(message: string): string {
  return `https://wa.me/${brand.salesWhatsapp}?text=${encodeURIComponent(message)}`;
}
