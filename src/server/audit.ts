import "server-only";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createAuditService } from "@/services/auditService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Registra um evento de auditoria em nome do usuário logado, com o autor vindo
 * da sessão verificada. Grava com service_role: usuário não escreve na trilha
 * direto, para não poder forjar eventos. Erro aqui
 * PROPAGA e desfaz a action — trilha de auditoria furada é pior que uma
 * operação recusada (mesma postura do inviteService).
 */
export async function recordAudit(entry: {
  companyId: string;
  /** Convenção entidade.verbo: member.role_changed, company.updated... */
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  const audit = createAuditService(createSupabaseAuditRepository(getSupabaseAdminClient()));
  await audit.record({
    companyId: entry.companyId,
    userId: data.user?.id ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}
