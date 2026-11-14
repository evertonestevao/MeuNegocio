import { AppError } from "@/lib/errors";
import { permissionService } from "./permissionService";
import type { ActorContext } from "@/server/actor";

/**
 * Primeiros passos de uma empresa nova, no Início: o que falta para o primeiro orçamento sair com a
 * cara da empresa. Some quando o primeiro orçamento é feito — que é o objetivo do cartão — mesmo que
 * logo ou clientes não tenham sido preenchidos, ou quando a empresa dispensa com "Não mostrar mais".
 * Só proprietário e administrador veem, porque logo e catálogo são deles.
 */

export interface FirstStepsCounts {
  catalogItems: number;
  clients: number;
  quotes: number;
}

export interface FirstStepsRepository {
  counts(companyId: string): Promise<FirstStepsCounts>;
  /** Marca a empresa como "não mostrar mais os primeiros passos". */
  dismiss(companyId: string): Promise<void>;
}

export interface FirstStep {
  key: "logo" | "catalog" | "clients" | "quote";
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

export function buildFirstSteps(input: { hasLogo: boolean } & FirstStepsCounts): FirstStep[] {
  return [
    { key: "logo", label: "Envie o logo da empresa", hint: "Ele vai no orçamento, no link e no recibo.", href: "/dashboard/settings", done: input.hasLogo },
    {
      key: "catalog",
      label: "Cadastre os serviços que você faz",
      hint: "Com preço e custo, eles entram no orçamento com um clique.",
      href: "/dashboard/catalog?kind=service",
      done: input.catalogItems > 0,
    },
    { key: "clients", label: "Traga seus clientes", hint: "Importe a planilha que você já tem ou cadastre um a um.", href: "/dashboard/clients/importar", done: input.clients > 0 },
    { key: "quote", label: "Monte o primeiro orçamento", hint: "E mande pelo WhatsApp ou pelo link de aprovação.", href: "/dashboard/quotes/new", done: input.quotes > 0 },
  ];
}

export function createFirstStepsService(repo: FirstStepsRepository) {
  return {
    /**
     * null quando não há o que mostrar: papel sem acesso, empresa já dispensou, ou o primeiro
     * orçamento já saiu (o objetivo do cartão — some mesmo sem logo ou clientes).
     */
    async get(actor: ActorContext, options: { hasLogo: boolean; dismissed: boolean }): Promise<FirstStep[] | null> {
      if (!permissionService.canEditCompany(actor.role)) return null;
      if (options.dismissed) return null;
      const counts = await repo.counts(actor.companyId);
      if (counts.quotes > 0) return null;
      return buildFirstSteps({ hasLogo: options.hasLogo, ...counts });
    },

    /** "Não mostrar mais": guarda na empresa, então some em qualquer aparelho. */
    async dismiss(actor: ActorContext): Promise<void> {
      if (!permissionService.canEditCompany(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador podem dispensar os primeiros passos");
      }
      await repo.dismiss(actor.companyId);
    },
  };
}

export type FirstStepsService = ReturnType<typeof createFirstStepsService>;
