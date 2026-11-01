import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv, requireServerEnv } from "@/config/env";
import { createDemoClient } from "./demo/client";
import { getDemoProfile } from "./demo/mode";

/**
 * Client Supabase com service_role — IGNORA RLS. Só pode existir em src/server
 * e route handlers (o import de "server-only" quebra o build se algum código
 * client tentar importar este arquivo).
 */

let adminClient: SupabaseClient | undefined;

function getRealAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      getClientEnv().NEXT_PUBLIC_SUPABASE_URL,
      requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}

/**
 * Saber se é demonstração exige ler os cookies, que é assíncrono, e este client é pedido de forma
 * síncrona. Por isso a cadeia (.from().select()...) é só anotada e roda ao ser aguardada, já no
 * client certo. Assim a demonstração nunca alcança o service_role.
 */
function deferred(steps: { key: string | symbol; args?: unknown[] }[]): unknown {
  const run = async () => {
    const demo = await getDemoProfile();
    let target: unknown = demo ? createDemoClient(demo) : getRealAdminClient();
    for (const step of steps) {
      const owner = target as Record<string | symbol, unknown>;
      const member = owner[step.key];
      target = step.args ? (member as (...args: unknown[]) => unknown).apply(owner, step.args) : member;
    }
    return target;
  };
  return new Proxy(function () {}, {
    get(_target, key) {
      if (key === "then") {
        const promise = run();
        return promise.then.bind(promise);
      }
      if (typeof key === "symbol") return undefined;
      return deferred([...steps, { key }]);
    },
    apply(_target, _self, args) {
      const last = steps[steps.length - 1];
      return deferred([...steps.slice(0, -1), { key: last.key, args }]);
    },
  });
}

export function getSupabaseAdminClient(): SupabaseClient {
  return deferred([]) as SupabaseClient;
}
