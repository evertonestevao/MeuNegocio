import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/config/env";
import { createSupabaseTrialEndingRepository } from "@/repositories/supabase/trialEndingRepository";
import { createTrialEndingService } from "@/services/trialEndingService";
import { getSupabaseAdminClient } from "./supabase-admin";

/** Aviso de fim do teste grátis. Usa service_role porque lê o e-mail dos proprietários em auth.users. */
export function getTrialEndingService() {
  return createTrialEndingService({
    repo: createSupabaseTrialEndingRepository(getSupabaseAdminClient()),
    provider: getEmailProvider(),
    appUrl: getServerEnv().APP_URL,
    replyTo: brand.legal.supportEmail,
  });
}
