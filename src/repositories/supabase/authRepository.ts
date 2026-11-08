import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { AuthRepository } from "@/services/authService";

/**
 * Implementação Supabase Auth do AuthRepository.
 * - `client`: vinculado aos cookies da request (getSupabaseServerClient) — grava a sessão.
 * - `admin`: service_role, só para criar a conta pelo servidor.
 *
 * O cadastro NÃO usa o signUp público (que exige enable_signup e deixaria criar
 * conta direto pela API, sem passar pelas checagens do app). Cria pelo admin e
 * loga em seguida para estabelecer a sessão nos cookies.
 */
export function createSupabaseAuthRepository(client: SupabaseClient, admin: SupabaseClient): AuthRepository {
  return {
    async signUp({ email, password, fullName }) {
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) {
        // Mensagem genérica: não revelar se o email já está cadastrado.
        throw new AppError("validation_error", "Não foi possível criar a conta", createError);
      }
      // createUser não cria sessão; o login aqui grava os cookies da request.
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) {
        throw new AppError("internal_error", "Conta criada, mas não foi possível iniciar a sessão", signInError);
      }
    },

    async signInWithPassword({ email, password }) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        throw new AppError("unauthorized", "E-mail ou senha incorretos.", error);
      }
    },

    async signOut() {
      // Só este aparelho: sair no computador não derruba o celular (e vice-versa).
      await client.auth.signOut({ scope: "local" });
    },

    async resetPasswordForEmail(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        // Não vazar se o email existe: logar internamente e seguir em silêncio.
        console.error("[auth] resetPasswordForEmail falhou:", error.message);
      }
    },

    async updatePassword(newPassword) {
      const { error } = await client.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
      if (error) {
        throw new AppError("unauthorized", "Não foi possível alterar a senha", error);
      }
    },
  };
}
