"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerEnv } from "@/config/env";
import { passwordSchema } from "@/features/auth/schemas";
import { AppError } from "@/lib/errors";
import { recordCompanyReferralFromCookie } from "@/modules/resellers/server";
import { createSupabaseAuthRepository } from "@/repositories/supabase/authRepository";
import { createSupabaseTenantRepository } from "@/repositories/supabase/tenantRepository";
import { createSupabaseTermsRepository } from "@/repositories/supabase/termsRepository";
import { recordAudit } from "@/server/audit";
import { rejectInDemo } from "@/server/demo/mode";
import { createRateLimiter } from "@/server/rateLimit";
import { getCompanyProfileService } from "@/server/quotes";
import { checkCompanyCnpj, recordOwnershipDeclaration } from "@/server/companyTrust";
import { isSignupOpen } from "@/server/signup";
import {
  getSignupFlowService,
  getSignupLimiters,
  isOnboardingPending,
  setOnboardingPending,
  SIGNUP_LEAD_COOKIE,
  SIGNUP_LEAD_COOKIE_MAX_AGE,
} from "@/server/signupFlow";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant, ACTIVE_COMPANY_COOKIE } from "@/server/tenant";
import { getRequestEvidence, getTermsService } from "@/server/terms";
import { createAuthService } from "@/services/authService";
import { companyProfileSchema } from "@/services/companyProfileService";
import { permissionService } from "@/services/permissionService";
import { provisionalCompanyName } from "@/services/signupFlowService";
import { createTenantService } from "@/services/tenantService";
import { createTermsService } from "@/services/termsService";
import { fieldErrorsOf, toActionError, type ActionState } from "./action-state";

/**
 * Cadastro em etapas. Passo 1 guarda nome, e-mail e aceite; passo 2 cria a conta e a empresa e leva
 * à assinatura; depois do pagamento (ou do teste), o passo final pede os dados da empresa.
 */

const signupAuthLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

function requireOpenSignup() {
  if (!isSignupOpen()) {
    throw new AppError("forbidden", "O cadastro é feito pelo administrador. Fale conosco para contratar.");
  }
}

export async function startSignupAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    requireOpenSignup();
    const [evidence, terms, cookieStore] = await Promise.all([getRequestEvidence(), getTermsService(), cookies()]);
    const current = await terms.getCurrentTerms();
    const { leadId } = await getSignupFlowService().start(Object.fromEntries(formData), {
      evidence,
      termsVersionId: current?.id ?? null,
      previousLeadId: cookieStore.get(SIGNUP_LEAD_COOKIE)?.value,
    });
    if (leadId) {
      cookieStore.set(SIGNUP_LEAD_COOKIE, leadId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: getServerEnv().APP_URL.startsWith("https://"),
        maxAge: SIGNUP_LEAD_COOKIE_MAX_AGE,
      });
    }
  } catch (err) {
    return toActionError(err);
  }
  redirect("/comecar/senha");
}

export async function createAccountAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    requireOpenSignup();
    const cookieStore = await cookies();
    const flow = getSignupFlowService();
    const lead = await flow.getPending(cookieStore.get(SIGNUP_LEAD_COOKIE)?.value);
    if (!lead) throw new AppError("not_found", "Seu cadastro expirou. Comece de novo pelo nome e e-mail.");

    const password = passwordSchema.safeParse(formData.get("password"));
    if (!password.success) throw new AppError("validation_error", password.error.issues[0]?.message ?? "Senha inválida.");

    const evidence = await getRequestEvidence();
    await getSignupLimiters().account.consume(`signup-account-ip:${evidence.ipAddress ?? "desconhecido"}`);

    // Um client só do começo ao fim: a sessão criada no cadastro vale para os passos seguintes.
    const client = await getSupabaseServerClient();
    await createAuthService({
      repo: createSupabaseAuthRepository(client),
      rateLimiter: signupAuthLimiter,
      appUrl: getServerEnv().APP_URL,
    })
      .signUp({ fullName: lead.full_name, email: lead.email, password: password.data })
      .catch((err: unknown) => {
        if (err instanceof AppError && err.code === "validation_error") {
          throw new AppError("validation_error", "Não foi possível criar a conta com este e-mail. Se você já tem conta, entre pelo login.", err);
        }
        throw err;
      });
    const { data: userData } = await client.auth.getUser();
    if (!userData.user) throw new AppError("internal_error", "Sessão não criada após o cadastro");

    // O aceite foi dado no primeiro passo; vale se a versão ainda é a vigente. Se mudou no meio, o
    // painel pede o reaceite antes de qualquer tela.
    const terms = createTermsService(createSupabaseTermsRepository(client, getSupabaseAdminClient()));
    const current = await terms.getCurrentTerms();
    if (current && current.id === lead.terms_version_id) {
      const leadEvidence = { ipAddress: lead.ip_address, userAgent: lead.user_agent };
      await terms.acceptCurrentTerms(leadEvidence);
      await terms.setConsent("email_communications", lead.email_consent, leadEvidence);
    }

    const company = await createTenantService(createSupabaseTenantRepository(client)).createCompany({
      name: provisionalCompanyName(lead.full_name),
    });
    await setOnboardingPending(company.id, true);
    cookieStore.set(ACTIVE_COMPANY_COOKIE, company.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    await recordCompanyReferralFromCookie(company.id);
    await flow.markAccount(lead.id, { userId: userData.user.id, companyId: company.id });
    cookieStore.delete(SIGNUP_LEAD_COOKIE);
  } catch (err) {
    return toActionError(err);
  }
  redirect("/assinar");
}

const essentialsSchema = companyProfileSchema.extend({
  name: z.string().trim().min(2, "Informe o nome da empresa.").max(80, "Use até 80 caracteres."),
});

/** Passo final: nome de verdade e dados que aparecem nos orçamentos. */
export async function completeOnboardingAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    await rejectInDemo();
    const { active } = await getActiveTenant();
    if (!active) throw new AppError("not_found", "Empresa não encontrada");
    if (!(await isOnboardingPending(active.id))) throw new AppError("conflict", "Os dados da empresa já foram preenchidos.");
    if (!permissionService.canEditCompany(active.role)) {
      throw new AppError("forbidden", "Só o proprietário completa os dados da empresa");
    }
    // Todos os problemas de uma vez, cada um junto do seu campo: corrigir um e descobrir o próximo cansa.
    const parsed = essentialsSchema.safeParse(Object.fromEntries(formData));
    const fieldErrors = parsed.success ? {} : fieldErrorsOf(parsed.error.issues);
    if (!fieldErrors.phone && !(parsed.success ? parsed.data.phone : String(formData.get("phone") ?? "").trim())) fieldErrors.phone = "Informe o telefone com DDD.";
    if (!parsed.success || Object.keys(fieldErrors).length > 0) {
      const count = Object.keys(fieldErrors).length;
      return { error: count > 1 ? "Confira os campos destacados." : "Confira o campo destacado.", fieldErrors };
    }
    const { name, ...profile } = parsed.data;

    // A declaração vem antes de tudo: sem ela, nada é gravado.
    await recordOwnershipDeclaration({ companyId: active.id, companyName: name, cnpj: profile.cnpj, accepted: formData.get("ownership_declaration") });
    const client = await getSupabaseServerClient();
    await createTenantService(createSupabaseTenantRepository(client)).updateCompany(active.id, { name });
    await (await getCompanyProfileService()).save({ companyId: active.id, role: active.role }, profile);
    await setOnboardingPending(active.id, false);
    if (profile.cnpj) await checkCompanyCnpj({ companyId: active.id, cnpj: profile.cnpj, companyName: name });
    await getSignupFlowService().markDoneByCompany(active.id);
    await recordAudit({ companyId: active.id, action: "company.onboarding_completed", entityType: "company", entityId: active.id, metadata: { name } });
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
