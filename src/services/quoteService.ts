import type { CloseQuoteInput, QuoteInput } from "@/features/quotes/schemas";
import { AppError } from "@/lib/errors";
import { estimatedCostCents, marginPercent } from "@/lib/quoteCalc";
import type { ActorContext } from "@/server/actor";
import type { CatalogItem, Quote, QuoteItem, QuoteListItem, QuoteResponse, QuoteStatus, Revenue } from "@/types/database";
import type { PublicQuote } from "@/types/quotes";
import { permissionService } from "./permissionService";
import { normalizePageParams, type PageParams, type Paginated } from "./tenantService";

const QUOTES_PAGE_SIZE = 20;

export type QuoteTransition = "send" | "approve" | "refuse" | "expire" | "reopen";

export interface QuoteRepository {
  list(companyId: string, params: { offset: number; limit: number; status: QuoteStatus | null; clientId: string | null }): Promise<Paginated<QuoteListItem>>;
  /** Enviados e aprovados: o que está em negociação ou por fechar. */
  listOpen(companyId: string): Promise<QuoteListItem[]>;
  countByStatus(companyId: string): Promise<Partial<Record<QuoteStatus, number>>>;
  /** Conta também os apagados: criar e excluir não libera o limite do mês. */
  countCreatedSince(companyId: string, sinceIso: string): Promise<number>;
  get(companyId: string, quoteId: string): Promise<Quote | null>;
  listItems(companyId: string, quoteId: string): Promise<QuoteItem[]>;
  listResponses(companyId: string, quoteId: string): Promise<QuoteResponse[]>;
  getRevenue(companyId: string, quoteId: string): Promise<Revenue | null>;
  save(companyId: string, quoteId: string | null, input: QuoteInput): Promise<string>;
  transition(companyId: string, quoteId: string, action: QuoteTransition, validUntil: string | null): Promise<void>;
  /** O faturamento e as parcelas a receber, na mesma transação. */
  close(companyId: string, quoteId: string, input: CloseQuoteInput): Promise<void>;
  undoClose(companyId: string, quoteId: string): Promise<void>;
  duplicate(companyId: string, quoteId: string): Promise<string>;
  softDelete(companyId: string, quoteId: string): Promise<void>;
}

/** Link público: só o servidor acessa, com service_role. */
export interface PublicQuoteRepository {
  getByToken(token: string): Promise<PublicQuote | null>;
  /** A assinatura é obrigatória ao aprovar; o banco confere que o caminho é da pasta do orçamento. */
  respond(token: string, decision: "approved" | "refused", name: string, comment: string, signaturePath: string | null): Promise<{ companyId: string; quoteId: string }>;
}

interface QuoteServiceDeps {
  repo: QuoteRepository;
  /** Limite de orçamentos por mês do plano; null é ilimitado. */
  getMonthlyLimit(companyId: string): Promise<number | null>;
  /** Início do mês corrente no fuso da empresa, em ISO. */
  getMonthStart(companyId: string): Promise<string>;
}

/** Custo, lucro e margem estimados. Só o proprietário e o administrador recebem. */
export function estimateQuoteProfit(
  totalCentsValue: number,
  items: QuoteItem[],
  catalog: Pick<CatalogItem, "id" | "cost_cents">[],
) {
  const costs = new Map(catalog.map((item) => [item.id, item.cost_cents]));
  const costCents = estimatedCostCents(
    items.map((item) => ({
      pricingMode: item.pricing_mode,
      quantity: item.quantity,
      people: item.people,
      costCents: item.catalog_item_id ? (costs.get(item.catalog_item_id) ?? null) : null,
    })),
  );
  return {
    costCents,
    profitCents: totalCentsValue - costCents,
    marginPercent: marginPercent(totalCentsValue, costCents),
  };
}

export function createQuoteService({ repo, getMonthlyLimit, getMonthStart }: QuoteServiceDeps) {
  function requireManage({ role }: ActorContext): void {
    if (!permissionService.canManageQuotes(role)) {
      throw new AppError("forbidden", "Sem permissão para acessar orçamentos");
    }
  }

  function requireClose({ role }: ActorContext): void {
    if (!permissionService.canCloseQuotes(role)) {
      throw new AppError("forbidden", "Só o proprietário e o administrador fecham orçamentos");
    }
  }

  async function assertMonthlyLimit(actor: ActorContext): Promise<void> {
    const limit = await getMonthlyLimit(actor.companyId);
    if (limit === null) return;
    const since = await getMonthStart(actor.companyId);
    if ((await repo.countCreatedSince(actor.companyId, since)) >= limit) {
      throw new AppError(
        "conflict",
        `Seu plano permite até ${limit} orçamentos por mês. Os atuais continuam disponíveis; troque de plano para criar novos.`,
      );
    }
  }

  return {
    async list(actor: ActorContext, params: PageParams & { status?: QuoteStatus | null; clientId?: string | null }) {
      requireManage(actor);
      const { page, pageSize, offset } = normalizePageParams(params, QUOTES_PAGE_SIZE);
      const [result, counts] = await Promise.all([
        repo.list(actor.companyId, {
          offset,
          limit: pageSize,
          status: params.status ?? null,
          clientId: params.clientId ?? null,
        }),
        repo.countByStatus(actor.companyId),
      ]);
      return { ...result, page, pageSize, counts };
    },

    async getDetail(actor: ActorContext, quoteId: string) {
      requireManage(actor);
      const quote = await repo.get(actor.companyId, quoteId);
      if (!quote) return null;
      const canClose = permissionService.canCloseQuotes(actor.role);
      const [items, responses, revenue] = await Promise.all([
        repo.listItems(actor.companyId, quoteId),
        repo.listResponses(actor.companyId, quoteId),
        canClose ? repo.getRevenue(actor.companyId, quoteId) : Promise.resolve(null),
      ]);
      return { quote, items, responses, revenue };
    },

    async save(actor: ActorContext, quoteId: string | null, input: QuoteInput): Promise<string> {
      requireManage(actor);
      if (quoteId === null) await assertMonthlyLimit(actor);
      return repo.save(actor.companyId, quoteId, input);
    },

    async transition(actor: ActorContext, quoteId: string, action: QuoteTransition, validUntil: string | null = null) {
      requireManage(actor);
      await repo.transition(actor.companyId, quoteId, action, validUntil);
    },

    async close(actor: ActorContext, quoteId: string, input: CloseQuoteInput) {
      requireClose(actor);
      await repo.close(actor.companyId, quoteId, input);
    },

    async undoClose(actor: ActorContext, quoteId: string) {
      requireClose(actor);
      await repo.undoClose(actor.companyId, quoteId);
    },

    async duplicate(actor: ActorContext, quoteId: string): Promise<string> {
      requireManage(actor);
      await assertMonthlyLimit(actor);
      return repo.duplicate(actor.companyId, quoteId);
    },

    async remove(actor: ActorContext, quoteId: string) {
      if (!permissionService.canDeleteRecords(actor.role)) {
        throw new AppError("forbidden", "Só o proprietário e o administrador podem excluir");
      }
      await repo.softDelete(actor.companyId, quoteId);
    },
  };
}

export type QuoteService = ReturnType<typeof createQuoteService>;
