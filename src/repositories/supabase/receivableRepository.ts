import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ReceivableRepository } from "@/services/receivableService";
import type { Receivable } from "@/types/finance";

const COLUMNS = "id, quote_id, amount_cents, due_date, method, received_on, received_cents, quote:quotes(number, title, client:clients(name))";

type Row = Omit<Receivable, "quote_number" | "quote_title" | "client_name"> & {
  quote: { number: number; title: string | null; client: { name: string } | null } | null;
};

function fail(error: { code?: string; message?: string } | null): never {
  // As funções do banco levantam P0001 com mensagem pensada para o usuário.
  if (error?.code === "P0001") throw new AppError("conflict", error.message ?? "Operação recusada", error);
  if (error?.code === "42501") throw new AppError("forbidden", "Sem permissão para esta ação", error);
  throw new AppError("internal_error", "Falha ao acessar os recebimentos", error);
}

function toReceivable({ quote, ...row }: Row): Receivable {
  return { ...row, quote_number: quote?.number ?? 0, quote_title: quote?.title ?? null, client_name: quote?.client?.name ?? null };
}

/** Parcelas a receber. A RLS restringe a leitura ao proprietário e ao administrador. */
export function createSupabaseReceivableRepository(client: SupabaseClient): ReceivableRepository {
  return {
    async listOpen(companyId) {
      const { data, error } = await client
        .from("receivables")
        .select(COLUMNS)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .is("received_on", null)
        .order("due_date", { ascending: true })
        .limit(1000);
      if (error) fail(error);
      return ((data ?? []) as unknown as Row[]).map(toReceivable);
    },

    async listReceived(companyId, from, to) {
      const { data, error } = await client
        .from("receivables")
        .select(COLUMNS)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("received_on", from)
        .lte("received_on", to)
        .order("received_on", { ascending: false })
        .limit(1000);
      if (error) fail(error);
      return ((data ?? []) as unknown as Row[]).map(toReceivable);
    },

    async listByQuote(companyId, quoteId) {
      const { data, error } = await client
        .from("receivables")
        .select(COLUMNS)
        .eq("company_id", companyId)
        .eq("quote_id", quoteId)
        .is("deleted_at", null)
        .order("due_date", { ascending: true });
      if (error) fail(error);
      return ((data ?? []) as unknown as Row[]).map(toReceivable);
    },

    async receive(companyId, input) {
      const { error } = await client.rpc("receive_installment", {
        p_company_id: companyId,
        p_id: input.id,
        p_received_on: input.receivedOn,
        p_received_cents: input.receivedCents,
        p_method: input.method,
        p_rest_due_date: input.restDueDate,
      });
      if (error) fail(error);
    },

    async undoReceive(companyId, id) {
      const { error } = await client.rpc("undo_receive_installment", { p_company_id: companyId, p_id: id });
      if (error) fail(error);
    },

    async reschedule(companyId, input) {
      const { error } = await client.rpc("reschedule_installment", {
        p_company_id: companyId,
        p_id: input.id,
        p_due_date: input.dueDate,
        p_method: input.method,
      });
      if (error) fail(error);
    },
  };
}
