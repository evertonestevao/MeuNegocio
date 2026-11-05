import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { QuoteNotificationReaders } from "@/services/quoteNotificationService";

/**
 * Recebe o client de service_role: quem responde o link não tem sessão, e o e-mail dos membros fica
 * em auth.users, que só o servidor lê.
 */
export function createSupabaseQuoteNotificationRepository(admin: SupabaseClient): QuoteNotificationReaders {
  return {
    async getQuoteSummary(companyId, quoteId) {
      const { data, error } = await admin
        .from("quotes")
        .select("number, title, total_cents, client:clients(name), company:companies(name)")
        .eq("company_id", companyId)
        .eq("id", quoteId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new AppError("internal_error", "Falha ao ler o orçamento do aviso", error);
      if (!data) return null;
      const row = data as unknown as { number: number; title: string | null; total_cents: number; client: { name: string } | null; company: { name: string } | null };
      return {
        companyName: row.company?.name ?? "",
        quoteNumber: row.number,
        quoteTitle: row.title,
        clientName: row.client?.name ?? null,
        totalCents: row.total_cents,
      };
    },

    async listManagerEmails(companyId) {
      const { data, error } = await admin
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .in("role", ["owner", "admin"])
        .is("deleted_at", null);
      if (error) throw new AppError("internal_error", "Falha ao ler os responsáveis da empresa", error);
      const users = await Promise.all(((data ?? []) as { user_id: string }[]).map(({ user_id }) => admin.auth.admin.getUserById(user_id)));
      return users.flatMap(({ data: found }) => (found.user?.email ? [found.user.email] : []));
    },
  };
}
