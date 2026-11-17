import type { EmailProvider } from "@/adapters/email/EmailProvider";
import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";
import { passwordRecoveryEmail } from "./passwordRecoveryEmail";

/**
 * Regras de autenticação. O repositório abstrai o provedor (Supabase Auth);
 * o rate limiter é obrigatório em login e recuperação de senha (CLAUDE.md).
 */

export interface AuthRepository {
  signUp(data: { email: string; password: string; fullName: string }): Promise<void>;
  signInWithPassword(data: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Gera o código de recuperação de senha da conta (o que vai no link do e-mail). Devolve null quando
   * a conta não existe, para o serviço responder igual nos dois casos.
   */
  createRecoveryToken(email: string): Promise<string | null>;
  /** Troca a senha do usuário logado (sessão de recovery conta como logado). */
  updatePassword(newPassword: string): Promise<void>;
}

interface AuthServiceDeps {
  repo: AuthRepository;
  rateLimiter: RateLimiter;
  /** URL pública da app para montar o link de recuperação. */
  appUrl: string;
  /** Envia o e-mail de recuperação de senha (o mesmo provedor dos outros e-mails do sistema). */
  emailProvider: EmailProvider;
}

export function createAuthService({ repo, rateLimiter, appUrl, emailProvider }: AuthServiceDeps) {
  const base = appUrl.replace(/\/+$/, "");

  async function signUp(input: unknown): Promise<void> {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Dados inválidos",
      );
    }
    await rateLimiter.consume(`signup:${parsed.data.email.toLowerCase()}`);
    await repo.signUp(parsed.data);
  }

  async function signIn(input: unknown): Promise<void> {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Dados inválidos",
      );
    }
    // Limite por email: bloqueia força bruta na conta mesmo com IPs variados.
    await rateLimiter.consume(`login:${parsed.data.email.toLowerCase()}`);
    await repo.signInWithPassword(parsed.data);
  }

  async function signOut(): Promise<void> {
    await repo.signOut();
  }

  async function requestPasswordReset(input: unknown): Promise<void> {
    const parsed = forgotPasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "E-mail inválido",
      );
    }
    await rateLimiter.consume(`password-reset:${parsed.data.email.toLowerCase()}`);
    const email = parsed.data.email;
    const token = await repo.createRecoveryToken(email);
    // Conta que não existe: mesma resposta de quem existe, para não revelar quem é cliente.
    if (!token) return;
    // O link é montado aqui, com o endereço público do app (APP_URL), e não pelo Supabase: não
    // depende da "Site URL" do painel. O /auth/confirm troca o código por sessão e leva a /reset-password.
    const link = `${base}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=recovery&next=/reset-password`;
    try {
      await emailProvider.send({ to: email, ...passwordRecoveryEmail(link, base) });
    } catch (err) {
      // Falha de envio não pode contar se o e-mail existe: loga por dentro e responde igual.
      console.error("[auth] envio do e-mail de recuperação falhou:", err instanceof Error ? err.message : "erro desconhecido");
    }
  }

  async function resetPassword(input: unknown): Promise<void> {
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Senha inválida",
      );
    }
    await repo.updatePassword(parsed.data.password);
  }

  return { signUp, signIn, signOut, requestPasswordReset, resetPassword };
}

export type AuthService = ReturnType<typeof createAuthService>;
