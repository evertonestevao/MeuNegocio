import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { formatQuoteNumber } from "@/features/quotes/status";
import type { AuditRepository } from "@/services/auditService";
import type { AuditLog } from "@/types/database";

/**
 * Implementação Supabase do AuditRepository. Client vem de fora: anon para
 * ações do usuário logado (a RLS exige user_id = auth.uid()), service_role
 * para eventos de sistema (webhooks) gravados no servidor.
 */
export function createSupabaseAuditRepository(client: SupabaseClient): AuditRepository {
  return {
    async insert(entry) {
      const { error } = await client.from("audit_logs").insert({
        company_id: entry.companyId,
        user_id: entry.userId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        metadata: entry.metadata,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar auditoria", error);
      }
    },

    async listByCompany(companyId, { limit, offset }) {
      const { data, error, count } = await client
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar auditoria", error);
      }
      return { items: (data ?? []) as AuditLog[], total: count ?? 0 };
    },

    async describeEntities(companyId, refs) {
      const idsOf = (type: string) => [...new Set(refs.filter((ref) => ref.entityType === type).map((ref) => ref.entityId))];
      const names: Record<string, string> = {};
      async function load(type: string, table: string, columns: string, label: (row: Record<string, unknown>) => string) {
        const ids = idsOf(type);
        if (ids.length === 0) return;
        const { data, error } = await client.from(table).select(`id, ${columns}`).eq("company_id", companyId).in("id", ids);
        if (error) throw new AppError("internal_error", "Falha ao listar auditoria", error);
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) names[`${type}:${String(row.id)}`] = label(row);
      }
      await Promise.all([
        load("quote", "quotes", "number, title", (row) =>
          [`Nº ${formatQuoteNumber(Number(row.number))}`, row.title ? String(row.title) : null].filter(Boolean).join(" · "),
        ),
        load("client", "clients", "name", (row) => String(row.name)),
        load("employee", "employees", "name", (row) => String(row.name)),
        load("catalog_item", "catalog_items", "name", (row) => String(row.name)),
      ]);
      return names;
    },
  };
}
