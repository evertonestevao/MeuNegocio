import "server-only";
import { createDemoClient } from "./demo/client";
import { getServerEnv } from "@/config/env";
import { todayInTimezone } from "@/lib/dates";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseCatalogRepository } from "@/repositories/supabase/catalogRepository";
import { createSupabaseCompanyProfileRepository } from "@/repositories/supabase/companyProfileRepository";
import {
  createSupabasePublicQuoteRepository,
  createSupabaseQuoteRepository,
} from "@/repositories/supabase/quoteRepository";
import { createBillingService } from "@/services/billingService";
import { createCatalogService, type CatalogService } from "@/services/catalogService";
import { createCompanyProfileService, type CompanyProfileService } from "@/services/companyProfileService";
import { createQuoteService, type PublicQuoteRepository, type QuoteService } from "@/services/quoteService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

// service_role só para ler o plano: assinaturas são restritas ao proprietário e ao administrador pela RLS, e o
// member precisa respeitar os mesmos limites da empresa.
function planBilling() {
  return createBillingService(createSupabaseBillingRepository(getSupabaseAdminClient()));
}

export async function getCatalogService(): Promise<CatalogService> {
  return createCatalogService(createSupabaseCatalogRepository(await getSupabaseServerClient()));
}

export async function getCompanyProfileService(): Promise<CompanyProfileService> {
  return createCompanyProfileService(createSupabaseCompanyProfileRepository(await getSupabaseServerClient()));
}

export async function getQuoteService(): Promise<QuoteService> {
  const profiles = await getCompanyProfileService();
  return createQuoteService({
    // service_role na contagem: a RLS esconde apagados, e o limite precisa contá-los.
    repo: {
      ...createSupabaseQuoteRepository(await getSupabaseServerClient()),
      countCreatedSince: createSupabaseQuoteRepository(getSupabaseAdminClient()).countCreatedSince,
    },
    getMonthlyLimit: (companyId) => planBilling().getFeatureLimit(companyId, "max_quotes_month"),
    async getMonthStart(companyId) {
      const { timezone } = await profiles.get(companyId);
      const firstDay = `${todayInTimezone(timezone).slice(0, 7)}-01`;
      // O deslocamento exato do fuso não muda a regra: um dia a mais ou a menos na virada.
      return new Date(`${firstDay}T03:00:00.000Z`).toISOString();
    },
  });
}

/** O plano da empresa libera o link de aprovação? */
export function canUsePublicApproval(companyId: string): Promise<boolean> {
  return planBilling().canAccessFeature(companyId, "public_approval");
}

export function getPublicQuoteUrl(token: string): string {
  return `${getServerEnv().APP_URL}/orcamento/${token}`;
}

/** Link público: sem sessão, com service_role, sempre a partir do token. */
/** Orçamento fictício para o link enviado da demonstração. Não fala com o banco. */
export function getDemoPublicQuote(token: string) {
  return createSupabasePublicQuoteRepository(createDemoClient("owner")).getByToken(token);
}

export function getPublicQuoteRepository(): PublicQuoteRepository {
  return createSupabasePublicQuoteRepository(getSupabaseAdminClient());
}
