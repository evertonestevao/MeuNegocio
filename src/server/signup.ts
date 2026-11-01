import "server-only";
import { getServerEnv } from "@/config/env";
import { getSupabaseAdminClient } from "./supabase-admin";

/** Cadastro aberto é a exceção: por padrão, quem cria empresa é o super admin. */
export function isSignupOpen(): boolean {
  return getServerEnv().SIGNUP_ENABLED === "true";
}

/** Com o cadastro fechado, só entra quem foi convidado para uma empresa. */
export async function hasPendingInvite(email: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdminClient()
    .from("company_invites")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .eq("status", "pending")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString());
  return !error && (count ?? 0) > 0;
}
