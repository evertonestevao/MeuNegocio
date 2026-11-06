import "server-only";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { createSupabaseSignupLeadRepository } from "@/repositories/supabase/signupLeadRepository";
import { createSignupFlowService, type SignupFlowService } from "@/services/signupFlowService";
import { createRateLimiter } from "./rateLimit";
import { getSupabaseAdminClient } from "./supabase-admin";

/** Liga o primeiro passo ao segundo. httpOnly: o id do cadastro nunca fica ao alcance de script. */
export const SIGNUP_LEAD_COOKIE = "signup-lead";
export const SIGNUP_LEAD_COOKIE_MAX_AGE = 60 * 60 * 24 * 2;

// Um por processo: o contador em memória precisa sobreviver entre requests.
let limiters: { ip: ReturnType<typeof createRateLimiter>; email: ReturnType<typeof createRateLimiter>; account: ReturnType<typeof createRateLimiter> } | null = null;

export function getSignupLimiters() {
  limiters ??= {
    ip: createRateLimiter({ limit: getServerEnv().SIGNUP_RATE_LIMIT_PER_IP, windowMs: 10 * 60_000 }),
    email: createRateLimiter({ limit: 3, windowMs: 60 * 60_000 }),
    // Criação de conta pelo segundo passo, por endereço de rede.
    account: createRateLimiter({ limit: getServerEnv().SIGNUP_RATE_LIMIT_PER_IP, windowMs: 60 * 60_000 }),
  };
  return limiters;
}

export function getSignupFlowService(): SignupFlowService {
  const { ip, email } = getSignupLimiters();
  return createSignupFlowService({
    repo: createSupabaseSignupLeadRepository(getSupabaseAdminClient()),
    ipLimiter: ip,
    emailLimiter: email,
  });
}

/** Empresa criada pelo cadastro em etapas que ainda não recebeu os dados essenciais. */
export async function isOnboardingPending(companyId: string): Promise<boolean> {
  const { data } = await getSupabaseAdminClient().from("companies").select("onboarding_pending").eq("id", companyId).maybeSingle<{ onboarding_pending: boolean }>();
  return data?.onboarding_pending === true;
}

export async function setOnboardingPending(companyId: string, pending: boolean): Promise<void> {
  const { error } = await getSupabaseAdminClient().from("companies").update({ onboarding_pending: pending }).eq("id", companyId);
  if (error) throw new AppError("internal_error", "Falha ao atualizar a empresa", error);
}
