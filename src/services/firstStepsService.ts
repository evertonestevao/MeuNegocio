import { permissionService } from "./permissionService";
import type { ActorContext } from "@/server/actor";

/**
 * Primeiros passos de uma empresa nova, no Início: o que falta para o primeiro orçamento sair com a
 * cara da empresa. Some quando tudo foi feito. Só proprietário e administrador veem, porque logo e
 * catálogo são deles.
 */

export interface FirstStepsCounts {
  catalogItems: number;
  clients: number;
  quotes: number;
}

export interface FirstStepsRepository {
  counts(companyId: string): Promise<FirstStepsCounts>;
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
    /** null quando não há o que mostrar: papel sem acesso ou tudo feito. */
    async get(actor: ActorContext, hasLogo: boolean): Promise<FirstStep[] | null> {
      if (!permissionService.canEditCompany(actor.role)) return null;
      const steps = buildFirstSteps({ hasLogo, ...(await repo.counts(actor.companyId)) });
      return steps.every((step) => step.done) ? null : steps;
    },
  };
}

export type FirstStepsService = ReturnType<typeof createFirstStepsService>;
