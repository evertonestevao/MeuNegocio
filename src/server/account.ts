import "server-only";
import {
  createSupabaseAccountRemover,
  createSupabaseAccountRepository,
} from "@/repositories/supabase/accountRepository";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { getResellerDeletionBlockers, getResellerExportData } from "@/modules/resellers/server";
import { createAccountService, type AccountService } from "@/services/accountService";
import { createAuditService } from "@/services/auditService";
import { createRateLimiter } from "./rateLimit";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

/** Exportação e exclusão são raras: limite baixo contra abuso e scraping. */
const accountLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

/**
 * Service de conta: leitura com o client do usuário (RLS ativa); só a exclusão
 * definitiva e a gravação na auditoria usam service_role.
 */
export async function getAccountService(): Promise<AccountService> {
  const client = await getSupabaseServerClient();
  const audit = createAuditService(createSupabaseAuditRepository(getSupabaseAdminClient()));
  return createAccountService({
    repo: {
      ...createSupabaseAccountRepository(client),
      // service_role: encerrar empresa não é aberto ao usuário no banco; o service só chega aqui
      // com empresas em que ele é o único membro, conferidas na sessão dele.
      closeCompany: (companyId) => createSupabaseAccountRepository(getSupabaseAdminClient()).closeCompany(companyId),
    },
    // Lazy: o client service_role só é criado se a exclusão chegar até aqui.
    remover: {
      deleteUser: (userId) =>
        createSupabaseAccountRemover(getSupabaseAdminClient()).deleteUser(userId),
    },
    audit: {
      record: ({ companyId, userId, action }) =>
        audit.record({
          companyId,
          userId,
          action,
          entityType: "user",
          entityId: userId,
          metadata: {},
        }),
    },
    rateLimiter: accountLimiter,
    extraDeletionBlockers: getResellerDeletionBlockers,
    extraExportData: getResellerExportData,
  });
}
