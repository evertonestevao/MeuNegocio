/**
 * Consulta de CNPJ numa base pública (dados da Receita Federal). Interface própria, como os demais
 * adapters: o service não sabe qual serviço responde. Trocar de fonte = outra implementação.
 */

export interface CompanyRecord {
  cnpj: string;
  officialName: string;
  tradeName: string | null;
  /** Situação cadastral como a base informa: "ATIVA", "BAIXADA", "INAPTA"... */
  situation: string;
  openedOn: string | null;
  city: string | null;
  state: string | null;
  /** Nomes do quadro de sócios. Usados só na comparação; não são guardados. */
  partnerNames: string[];
}

export type CompanyLookup = { status: "found"; record: CompanyRecord } | { status: "not_found" } | { status: "unavailable" };

export interface CompanyRegistry {
  readonly name: string;
  /** Nunca lança: falha de rede ou da base volta como "unavailable". */
  lookup(cnpj: string): Promise<CompanyLookup>;
}
