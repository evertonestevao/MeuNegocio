import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Supabase que os testes acessam com service_role: o mesmo que o app usa. Nunca assumir a porta
 * padrão: outro projeto local pode estar nela, e a chave de serviço local é igual em todos.
 */
function resolveSupabaseUrl(): string {
  if (process.env.E2E_SUPABASE_URL) return process.env.E2E_SUPABASE_URL;
  const envFile = path.resolve(__dirname, "../.env.local");
  const line = existsSync(envFile)
    ? readFileSync(envFile, "utf8").split("\n").find((row) => row.startsWith("NEXT_PUBLIC_SUPABASE_URL="))
    : undefined;
  if (!line) throw new Error("Defina E2E_SUPABASE_URL ou crie o .env.local antes de rodar os testes.");
  return line.slice(line.indexOf("=") + 1).trim();
}

export const E2E_SUPABASE_URL = resolveSupabaseUrl();
