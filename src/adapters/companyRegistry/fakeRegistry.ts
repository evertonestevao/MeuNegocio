import type { CompanyLookup, CompanyRegistry } from "./CompanyRegistry";

/**
 * Base fictícia para desenvolvimento e testes, sem rede. CNPJs conhecidos:
 * 11.222.333/0001-81 é a "Empresa Exemplo Serviços Ltda", ativa, com sócia "Ana Exemplo Lima";
 * 11.444.777/0001-61 está baixado; os demais não existem.
 */
export function createFakeRegistry(): CompanyRegistry {
  return {
    name: "fake",
    async lookup(cnpj): Promise<CompanyLookup> {
      if (cnpj === "11222333000181") {
        return {
          status: "found",
          record: {
            cnpj,
            officialName: "EMPRESA EXEMPLO SERVICOS LTDA",
            tradeName: "EXEMPLO REFRIGERACAO",
            situation: "ATIVA",
            openedOn: "2015-03-10",
            city: "BAURU",
            state: "SP",
            partnerNames: ["ANA EXEMPLO LIMA"],
          },
        };
      }
      if (cnpj === "11444777000161") {
        return {
          status: "found",
          record: { cnpj, officialName: "ANTIGA EMPRESA LTDA", tradeName: null, situation: "BAIXADA", openedOn: null, city: null, state: null, partnerNames: [] },
        };
      }
      return { status: "not_found" };
    },
  };
}
