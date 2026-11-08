"use server";

import { redirect } from "next/navigation";
import { getServerEnv } from "@/config/env";
import { resolvePostLoginPath } from "@/modules/resellers/areaAccess";
import { createSupabaseAuthRepository } from "@/repositories/supabase/authRepository";
import { createRateLimiter } from "@/server/rateLimit";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createAuthService } from "@/services/authService";
import { toActionError, type ActionState } from "./action-state";
import { AppError } from "@/lib/errors";
import { safeInternalPath } from "@/lib/safeRedirect";
import { hasPendingInvite, isSignupOpen } from "@/server/signup";

/**
 * Server actions de autenticação: entrada única dos forms de auth.
 * Fluxo: action → authService (Zod + rate limit) → authRepository → Supabase.
 */

// Store escolhido por RATE_LIMIT_STORE (memory em dev, redis/Upstash em prod
// multi-instância) — ver src/server/rateLimit.ts.
const loginLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

async function getAuthService() {
  const client = await getSupabaseServerClient();
  return createAuthService({
    repo: createSupabaseAuthRepository(client, getSupabaseAdminClient()),
    rateLimiter: loginLimiter,
    appUrl: getServerEnv().APP_URL,
  });
}

export async function signUpAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const next = formData.get("next");
  try {
    // A verdade é aqui, não na tela: fechado, só passa quem tem convite pendente para o e-mail.
    if (!isSignupOpen() && !(await hasPendingInvite(String(formData.get("email") ?? "")))) {
      throw new AppError("forbidden", "O cadastro é feito pelo administrador. Fale conosco para contratar.");
    }
    const auth = await getAuthService();
    await auth.signUp({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  } catch (err) {
    return toActionError(err);
  }
  // Preserva o destino (ex.: convidado voltando para /invites/accept).
  redirect(safeInternalPath(next, "/onboarding"));
}

export async function signInAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const next = formData.get("next");
  let destination: string;
  try {
    const auth = await getAuthService();
    await auth.signIn({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    destination = safeInternalPath(next, "") || (await resolvePostLoginPath());
  } catch (err) {
    return toActionError(err);
  }
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const auth = await getAuthService();
  await auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const auth = await getAuthService();
    await auth.requestPasswordReset({ email: formData.get("email") });
  } catch (err) {
    return toActionError(err);
  }
  // Mesma resposta com email existente ou não: sem enumeração de contas.
  return { success: "Se o e-mail existir, você receberá um link de recuperação." };
}

export async function resetPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const auth = await getAuthService();
    await auth.resetPassword({ password: formData.get("password") });
  } catch (err) {
    return toActionError(err);
  }
  redirect("/dashboard");
}
