import "server-only";
import { getCompanyRegistry } from "@/adapters/companyRegistry";
import { reportError } from "@/adapters/errorReporting";
import { AppError } from "@/lib/errors";
import { createSupabaseCompanyEvidenceReader, createSupabaseCompanyTrustRepository } from "@/repositories/supabase/companyTrustRepository";
import { createCompanyTrustService, type CompanyTrustService } from "@/services/companyTrustService";
import { createRateLimiter } from "./rateLimit";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { getRequestEvidence, getTermsService } from "./terms";

// Um por processo: o contador em memória precisa sobreviver entre requests.
const reportLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

export function getCompanyTrustService(): CompanyTrustService {
  return createCompanyTrustService({
    repo: createSupabaseCompanyTrustRepository(getSupabaseAdminClient()),
    registry: getCompanyRegistry(),
    reportLimiter,
  });
}

/** Comprovantes para o super admin, lidos com a sessão dele (a RLS só libera para ele). */
export async function getCompanyEvidenceReader() {
  return createSupabaseCompanyEvidenceReader(await getSupabaseServerClient());
}

async function currentUser() {
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user?.email) throw new AppError("unauthorized", "Sessão expirada");
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle<{ full_name: string | null }>();
  return { id: data.user.id, email: data.user.email, name: profile?.full_name?.trim() || data.user.email };
}

/** Grava a declaração de quem está cadastrando a empresa, com a evidência da request. */
export async function recordOwnershipDeclaration(input: { companyId: string; companyName: string; cnpj: string | null; accepted: unknown }) {
  const [user, evidence, terms] = await Promise.all([currentUser(), getRequestEvidence(), getTermsService()]);
  const current = await terms.getCurrentTerms();
  await getCompanyTrustService().declare(
    {
      companyId: input.companyId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      companyName: input.companyName,
      cnpj: input.cnpj,
      termsVersionId: current?.id ?? null,
      evidence,
    },
    input.accepted,
  );
}

/** Confere o CNPJ sem nunca derrubar quem chamou: falhou, fica registrado no monitoramento. */
export async function checkCompanyCnpj(input: { companyId: string; cnpj: string; companyName: string }) {
  try {
    const user = await currentUser();
    await getCompanyTrustService().checkCnpj({ companyId: input.companyId, cnpj: input.cnpj, informedName: input.companyName, declarantName: user.name });
  } catch (err) {
    void reportError(err, { source: "action" });
  }
}
