import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { searchTerms } from "@/lib/search";
import { paymentPlanText } from "@/lib/installments";
import type { QuotePaymentPlan } from "@/types/finance";
import type { PublicQuoteRepository, QuoteRepository } from "@/services/quoteService";
import type { Quote, QuoteItem, QuoteListItem, QuoteResponse, QuoteHistoryEntry, QuoteStatus, QuoteView, Revenue } from "@/types/database";
import type { PublicQuote } from "@/types/quotes";

function fail(error: { code?: string; message?: string } | null): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar os orçamentos", error);
}

const VIEW_EMBED = "view:quote_views(first_viewed_at, last_viewed_at, view_count)";

type ListRow = Quote & { client: { name: string } | null; view: QuoteView | QuoteView[] | null };

/** A abertura vem como objeto ou lista de um, conforme a relação que o banco enxerga. */
function oneView(view: QuoteView | QuoteView[] | null | undefined): QuoteView | null {
  return (Array.isArray(view) ? view[0] : view) ?? null;
}

function toListItem({ client: related, view, ...row }: ListRow): QuoteListItem {
  return { ...row, client_name: related?.name ?? null, view: oneView(view) };
}

/** Leitura com RLS; toda escrita passa pelas funções do banco. */
export function createSupabaseQuoteRepository(client: SupabaseClient): QuoteRepository {
  return {
    async list(companyId, { offset, limit, status, clientId, search }) {
      let query = client
        .from("quotes")
        .select(`*, client:clients(name), ${VIEW_EMBED}`, { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (status) query = query.eq("status", status);
      if (clientId) query = query.eq("client_id", clientId);
      if (search) {
        // Pelo título e pelo nome do cliente, sem acento; número ("12", "0012", "#12") vai direto.
        const pattern = (value: string) => JSON.stringify(`%${value.replace(/[%_\\]/g, "\\$&")}%`);
        const { text } = searchTerms(search);
        const conditions = [`search_text.ilike.${pattern(text)}`];
        const number = /^#?\s*0*(\d{1,9})$/.exec(search.trim());
        if (number) conditions.push(`number.eq.${Number(number[1])}`);
        const { data: clients, error: clientsError } = await client
          .from("clients")
          .select("id")
          .eq("company_id", companyId)
          .or(`search_text.ilike.${pattern(text)}`)
          .limit(200);
        if (clientsError) fail(clientsError);
        const ids = (clients ?? []).map((row: { id: string }) => row.id);
        if (ids.length > 0) conditions.push(`client_id.in.(${ids.join(",")})`);
        query = query.or(conditions.join(","));
      }
      const { data, error, count } = await query.order("number", { ascending: false }).range(offset, offset + limit - 1);
      if (error) fail(error);
      const items: QuoteListItem[] = ((data ?? []) as unknown as ListRow[]).map(toListItem);
      return { items, total: count ?? 0, page: 1, pageSize: limit };
    },

    async listOpen(companyId) {
      const { data, error } = await client
        .from("quotes")
        .select(`*, client:clients(name), ${VIEW_EMBED}`)
        .eq("company_id", companyId)
        .in("status", ["sent", "approved"])
        .is("deleted_at", null)
        .order("number", { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as unknown as ListRow[]).map(toListItem);
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

    async getView(companyId, quoteId) {
      const { data, error } = await client
        .from("quote_views")
        .select("first_viewed_at, last_viewed_at, view_count")
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .maybeSingle<QuoteView>();
      if (error) fail(error);
      return data;
    },

    async history(companyId, quoteId) {
      const { data, error } = await client.rpc("quote_history", { p_company_id: companyId, p_quote_id: quoteId });
      if (error) fail(error);
      return (data ?? []) as QuoteHistoryEntry[];
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
      // Condições de pagamento à parte: mesma regra de só rascunho, sem mexer em save_quote.
      const plan = await client.rpc("set_quote_payment_plan", { p_company_id: companyId, p_quote_id: data as string, p_plan: input.paymentPlan });
      if (plan.error) fail(plan.error);
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
  payment_plan?: QuotePaymentPlan | null;
  company: Omit<PublicQuote["document"]["company"], "logoUrl"> & { logo_path?: string | null };
  client: { name: string; document: string | null; phone?: string | null; email?: string | null };
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

/**
 * Recebe o client de service_role: o link público não tem sessão. logoUrl transforma o caminho do
 * logo em link (o storage é outra peça); sem ela, o documento sai sem logo.
 */
export function createSupabasePublicQuoteRepository(
  client: SupabaseClient,
  logoUrl: (path: string | null | undefined) => string | null = () => null,
): PublicQuoteRepository {
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
          company: {
            name: row.company.name,
            cnpj: row.company.cnpj,
            phone: row.company.phone,
            email: row.company.email,
            address: row.company.address,
            logoUrl: logoUrl(row.company.logo_path),
          },
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
          paymentTerms: paymentPlanText(row.payment_plan, row.total_cents),
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

    async recordView(token) {
      const { error } = await client.rpc("record_quote_view", { p_token: token });
      if (error) fail(error);
    },
  };
}
