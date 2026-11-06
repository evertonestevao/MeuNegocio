import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CompanyTrustRepository } from "@/services/companyTrustService";
import type { AbuseReport, CompanyCnpjCheck, CompanyDeclaration, CompanySuspensionEvent } from "@/types/database";

function fail(error: unknown, message: string): never {
  throw new AppError("internal_error", message, error);
}

/** Gravação das provas. Recebe o client de service_role: as tabelas não têm policy de escrita. */
export function createSupabaseCompanyTrustRepository(adminClient: SupabaseClient): CompanyTrustRepository {
  return {
    async insertDeclaration(row) {
      const { error } = await adminClient.from("company_declarations").insert({
        company_id: row.companyId,
        user_id: row.userId,
        user_name: row.userName,
        user_email: row.userEmail,
        company_name: row.companyName,
        cnpj: row.cnpj,
        statement: row.statement,
        terms_version_id: row.termsVersionId,
        ip_address: row.evidence.ipAddress,
        user_agent: row.evidence.userAgent?.slice(0, 500) ?? null,
      });
      if (error) fail(error, "Falha ao guardar a declaração");
    },

    async insertCnpjCheck(row) {
      const { error } = await adminClient.from("company_cnpj_checks").insert({
        company_id: row.companyId,
        cnpj: row.cnpj,
        informed_name: row.informedName,
        result: row.result,
        official_name: row.officialName,
        trade_name: row.tradeName,
        situation: row.situation,
        opened_on: row.openedOn,
        city: row.city,
        state: row.state,
        declarant_in_partners: row.declarantInPartners,
        source: row.source,
      });
      if (error) fail(error, "Falha ao guardar a conferência do CNPJ");
    },

    async insertAbuseReport(row) {
      const { error } = await adminClient.from("abuse_reports").insert({
        company_id: row.companyId,
        quote_id: row.quoteId,
        company_name: row.companyName,
        reason: row.reason,
        message: row.message,
        reporter_name: row.reporterName,
        reporter_contact: row.reporterContact,
        ip_address: row.evidence.ipAddress,
        user_agent: row.evidence.userAgent?.slice(0, 500) ?? null,
      });
      if (error) fail(error, "Falha ao guardar a denúncia");
    },

    async setSuspension({ companyId, suspend, reason, actorId, actorEmail }) {
      const { error } = await adminClient
        .from("companies")
        .update(suspend ? { suspended_at: new Date().toISOString(), suspension_reason: reason } : { suspended_at: null, suspension_reason: null })
        .eq("id", companyId);
      if (error) fail(error, "Falha ao atualizar a empresa");
      const event = await adminClient.from("company_suspension_events").insert({
        company_id: companyId,
        action: suspend ? "suspended" : "reactivated",
        reason,
        actor_id: actorId,
        actor_email: actorEmail,
      });
      if (event.error) fail(event.error, "Falha ao guardar o histórico da suspensão");
    },
  };
}

export interface CompanyEvidence {
  declarations: CompanyDeclaration[];
  cnpjChecks: CompanyCnpjCheck[];
  reports: AbuseReport[];
  suspensionEvents: CompanySuspensionEvent[];
}

/** Leitura das provas pelo super admin, com a sessão dele: a RLS só libera para ele. */
export function createSupabaseCompanyEvidenceReader(client: SupabaseClient) {
  return {
    async getEvidence(companyId: string): Promise<CompanyEvidence> {
      const [declarations, cnpjChecks, reports, suspensionEvents] = await Promise.all([
        client.from("company_declarations").select("*").eq("company_id", companyId).order("declared_at", { ascending: false }),
        client.from("company_cnpj_checks").select("*").eq("company_id", companyId).order("checked_at", { ascending: false }),
        client.from("abuse_reports").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        client.from("company_suspension_events").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      ]);
      for (const result of [declarations, cnpjChecks, reports, suspensionEvents]) {
        if (result.error) fail(result.error, "Falha ao ler os comprovantes da empresa");
      }
      return {
        declarations: (declarations.data ?? []) as CompanyDeclaration[],
        cnpjChecks: (cnpjChecks.data ?? []) as CompanyCnpjCheck[],
        reports: (reports.data ?? []) as AbuseReport[],
        suspensionEvents: (suspensionEvents.data ?? []) as CompanySuspensionEvent[],
      };
    },

    async listReports(limit: number): Promise<AbuseReport[]> {
      const { data, error } = await client.from("abuse_reports").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) fail(error, "Falha ao listar as denúncias");
      return (data ?? []) as AbuseReport[];
    },

    /** Para a lista de empresas: a última conferência de CNPJ e quantas denúncias cada uma tem. */
    async getFlags(companyIds: string[]): Promise<Record<string, { lastCheck: CompanyCnpjCheck | null; reports: number }>> {
      if (companyIds.length === 0) return {};
      const [checks, reports] = await Promise.all([
        client.from("company_cnpj_checks").select("*").in("company_id", companyIds).order("checked_at", { ascending: false }),
        client.from("abuse_reports").select("company_id").in("company_id", companyIds),
      ]);
      if (checks.error) fail(checks.error, "Falha ao ler as conferências de CNPJ");
      if (reports.error) fail(reports.error, "Falha ao ler as denúncias");
      const flags: Record<string, { lastCheck: CompanyCnpjCheck | null; reports: number }> = {};
      for (const id of companyIds) flags[id] = { lastCheck: null, reports: 0 };
      for (const check of (checks.data ?? []) as CompanyCnpjCheck[]) flags[check.company_id].lastCheck ??= check;
      for (const report of (reports.data ?? []) as { company_id: string }[]) flags[report.company_id].reports += 1;
      return flags;
    },
  };
}
