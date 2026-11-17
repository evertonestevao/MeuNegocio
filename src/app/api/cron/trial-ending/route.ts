import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { safeEqual } from "@/lib/safeEqual";
import { getTrialEndingService } from "@/server/trialEnding";

export const dynamic = "force-dynamic";

/**
 * Chamada todo dia às 10h (Brasília) pelo pg_cron do Supabase, com `Authorization: Bearer CRON_SECRET`.
 * Envia o aviso de "o teste acaba em 2 dias". A resposta traz só contagens, nunca e-mail de ninguém.
 */
export async function POST(request: Request) {
  const env = getServerEnv();
  // Sem segredo configurado a rota fica fechada, em vez de aberta.
  if (!env.CRON_SECRET) return Response.json({ error: "cron_not_configured" }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Em produção o provedor "console" só imprime: marcaria o aviso como enviado sem ninguém receber.
  if (env.APP_ENV.toLowerCase() === "production" && getEmailProvider().name === "console") {
    return Response.json({ error: "email_provider_not_configured" }, { status: 503 });
  }
  try {
    const run = await getTrialEndingService().run();
    if (run.failed > 0 || run.unmarked > 0) console.error(`[trial-ending] ${run.failed} assinatura(s) sem e-mail enviado e ${run.unmarked} enviada(s) sem marca de avisado`);
    return Response.json(run);
  } catch (error) {
    console.error("[trial-ending] falha na rotina", error instanceof Error ? error.message : "erro desconhecido");
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
