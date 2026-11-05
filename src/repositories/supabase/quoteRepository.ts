import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PublicQuoteRepository, QuoteRepository } from "@/services/quoteService";
import type { Quote, QuoteItem, QuoteListItem, QuoteResponse, QuoteStatus, Revenue } from "@/types/database";
import type { PublicQuote } from "@/types/quotes";

function fail(error: { code?: string; message?: string } | null): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar os orçamentos", error);
}

/** Leitura com RLS; toda escrita passa pelas funções do banco. */
export function createSupabaseQuoteRepository(client: SupabaseClient): QuoteRepository {
  return {
    async list(companyId, { offset, limit, status, clientId }) {
      let query = client
        .from("quotes")
        .select("*, client:clients(name)", { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (status) query = query.eq("status", status);
      if (clientId) query = query.eq("client_id", clientId);
      const { data, error, count } = await query.order("number", { ascending: false }).range(offset, offset + limit - 1);
      if (error) fail(error);
      type Row = Quote & { client: { name: string } | null };
      const items: QuoteListItem[] = ((data ?? []) as unknown as Row[]).map(({ client: related, ...row }) => ({
        ...row,
        client_name: related?.name ?? null,
      }));
      return { items, total: count ?? 0, page: 1, pageSize: limit };
    },

    async listOpen(companyId) {
      const { data, error } = await client
        .from("quotes")
        .select("*, client:clients(name)")
        .eq("company_id", companyId)
        .in("status", ["sent", "approved"])
        .is("deleted_at", null)
        .order("number", { ascending: false });
      if (error) fail(error);
      type Row = Quote & { client: { name: string } | null };
      return ((data ?? []) as unknown as Row[]).map(({ client: related, ...row }) => ({
        ...row,
        client_name: related?.name ?? null,
      }));
    },

    async countByStatus(companyId) {
      const { data, error } = await client
        .from("quotes")
        .select("status")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) fail(error);
      const counts: Partial<Record<QuoteStatus, number>> = {};
      for (const row of (data ?? []) as { status: QuoteStatus }[]) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
      }
      return counts;
    },

    async countCreatedSince(companyId, sinceIso) {
      const { count, error } = await client
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", sinceIso);
      if (error) fail(error);
      return count ?? 0;
    },

    async get(companyId, quoteId) {
      const { data, error } = await client
        .from("quotes")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null)
        .maybeSingle<Quote>();
      if (error) fail(error);
      return data;
    },

    async listItems(companyId, quoteId) {
      const { data, error } = await client
        .from("quote_items")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) fail(error);
      const items = (data ?? []) as QuoteItem[];
      // A RLS só devolve custos para owner e admin: para o membro, a lista vem vazia.
      const costs = new Map<string, number>();
      if (items.length > 0) {
        const result = await client
          .from("quote_item_costs")
          .select("quote_item_id, cost_cents")
          .in("quote_item_id", items.map((item) => item.id));
        if (result.error) fail(result.error);
        for (const row of (result.data ?? []) as { quote_item_id: string; cost_cents: number }[]) costs.set(row.quote_item_id, row.cost_cents);
      }
      return items.map((item) => ({ ...item, quantity: Number(item.quantity), cost_cents: costs.get(item.id) ?? null }));
    },

    async listResponses(companyId, quoteId) {
      const { data, error } = await client
        .from("quote_responses")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) fail(error);
      return (data ?? []) as QuoteResponse[];
    },

    async getRevenue(companyId, quoteId) {
      const { data, error } = await client
        .from("revenues")
        .select("*")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .maybeSingle<Revenue>();
      if (error) fail(error);
      return data;
    },

    async save(companyId, quoteId, input) {
      const { data, error } = await client.rpc("save_quote", {
        p_company_id: companyId,
        p_quote_id: quoteId,
        p_client_id: input.clientId,
        p_location_id: input.locationId,
        p_title: input.title,
        p_valid_until: input.validUntil,
        p_discount_cents: input.discountCents,
        p_notes: input.notes,
        p_items: input.items.map((item) => ({
          catalog_item_id: item.catalogItemId,
          description: item.description,
          unit: item.unit,
          pricing_mode: item.pricingMode,
          quantity: item.quantity,
          people: item.people,
          unit_price_cents: item.unitPriceCents,
          cost_cents: item.costCents ?? null,
        })),
      });
      if (error) fail(error);
      return data as string;
    },

    async transition(companyId, quoteId, action, validUntil) {
      const { error } = await client.rpc("transition_quote", {
        p_company_id: companyId,
        p_quote_id: quoteId,
        p_action: action,
        p_valid_until: validUntil,
      });
      if (error) fail(error);
    },

    async close(companyId, quoteId, { amountCents, competenceDate, installments }) {
      const { error } = await client.rpc("close_quote", {
        p_company_id: companyId,
        p_quote_id: quoteId,
        p_amount_cents: amountCents,
        p_competence_date: competenceDate,
        p_installments: installments,
      });
      if (error) fail(error);
    },

    async undoClose(companyId, quoteId) {
      const { error } = await client.rpc("undo_close_quote", { p_company_id: companyId, p_quote_id: quoteId });
      if (error) fail(error);
    },

    async duplicate(companyId, quoteId) {
      const { data, error } = await client.rpc("duplicate_quote", { p_company_id: companyId, p_quote_id: quoteId });
      if (error) fail(error);
      return data as string;
    },

    async softDelete(companyId, quoteId) {
      const { error } = await client.rpc("delete_quote", { p_company_id: companyId, p_quote_id: quoteId });
      if (error) fail(error);
    },
  };
}

interface PublicQuoteRow {
  company_id: string;
  quote_id: string;
  number: number;
  title: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  is_within_validity: boolean | null;
  created_at: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string | null;
  company: PublicQuote["document"]["company"];
  client: { name: string; document: string | null };
  location: { name: string; address: string } | null;
  items: {
    description: string;
    unit: string;
    pricing_mode: "fixed" | "hourly";
    quantity: number;
    people: number;
    unit_price_cents: number;
    line_total_cents: number;
  }[];
  response: { decision: "approved" | "refused"; name: string; comment: string | null; created_at: string; signature_path?: string | null } | null;
}

/** Recebe o client de service_role: o link público não tem sessão. */
export function createSupabasePublicQuoteRepository(client: SupabaseClient): PublicQuoteRepository {
  return {
    async getByToken(token) {
      const { data, error } = await client.rpc("get_public_quote", { p_token: token });
      if (error) fail(error);
      const row = data as PublicQuoteRow | null;
      if (!row) return null;
      return {
        companyId: row.company_id,
        quoteId: row.quote_id,
        isWithinValidity: row.is_within_validity === true,
        response: row.response
          ? {
              decision: row.response.decision,
              name: row.response.name,
              comment: row.response.comment,
              createdAt: row.response.created_at,
              signaturePath: row.response.signature_path ?? null,
            }
          : null,
        document: {
          number: row.number,
          title: row.title,
          status: row.status,
          createdAt: row.created_at,
          validUntil: row.valid_until,
          company: row.company,
          client: row.client,
          location: row.location,
          items: row.items.map((item) => ({
            description: item.description,
            unit: item.unit,
            pricingMode: item.pricing_mode,
            quantity: Number(item.quantity),
            people: item.people,
            unitPriceCents: item.unit_price_cents,
            lineTotalCents: item.line_total_cents,
          })),
          subtotalCents: row.subtotal_cents,
          discountCents: row.discount_cents,
          totalCents: row.total_cents,
          notes: row.notes,
        },
      };
    },

    async respond(token, decision, name, comment, signaturePath) {
      const { data, error } = await client.rpc("respond_public_quote", {
        p_token: token,
        p_decision: decision,
        p_name: name,
        p_comment: comment,
        p_signature_path: signaturePath,
      });
      if (error) fail(error);
      const result = data as { company_id: string; quote_id: string };
      return { companyId: result.company_id, quoteId: result.quote_id };
    },
  };
}
