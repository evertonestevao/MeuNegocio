import type { CompanyLookup, CompanyRegistry } from "./CompanyRegistry";

const TIMEOUT_MS = 6000;

interface BrasilApiCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string;
  data_inicio_atividade: string | null;
  municipio: string | null;
  uf: string | null;
  qsa?: { nome_socio?: string | null }[] | null;
}

/**
 * BrasilAPI (brasilapi.com.br): gratuita, sem chave, com os dados públicos da Receita. Sem um
 * User-Agent identificado, o firewall dela responde 403.
 */
export function createBrasilApiRegistry({ userAgent, fetchFn = fetch }: { userAgent: string; fetchFn?: typeof fetch }): CompanyRegistry {
  return {
    name: "brasilapi",
    async lookup(cnpj): Promise<CompanyLookup> {
      try {
        const response = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { Accept: "application/json", "User-Agent": userAgent },
        });
        if (response.status === 404) return { status: "not_found" };
        if (!response.ok) return { status: "unavailable" };
        const data = (await response.json()) as BrasilApiCnpj;
        if (!data?.razao_social) return { status: "unavailable" };
        return {
          status: "found",
          record: {
            cnpj: data.cnpj,
            officialName: data.razao_social,
            tradeName: data.nome_fantasia || null,
            situation: data.descricao_situacao_cadastral ?? "",
            openedOn: data.data_inicio_atividade || null,
            city: data.municipio || null,
            state: data.uf || null,
            partnerNames: (data.qsa ?? []).map((partner) => partner.nome_socio ?? "").filter(Boolean),
          },
        };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}
