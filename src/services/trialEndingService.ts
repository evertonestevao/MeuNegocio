import type { EmailMessage, EmailProvider } from "@/adapters/email/EmailProvider";
import { brand } from "@/config/brand";
import { formatDate } from "@/lib/dates";
import { emailParagraph, renderEmailLayout } from "@/lib/emailLayout";
import { escapeHtml } from "@/lib/html";

/**
 * Aviso por e-mail 2 dias antes do fim do teste grátis. Quem decide o dia e quem já foi avisado é o
 * banco (função trial_ending_notices, chamada todo dia às 10h pelo pg_cron); aqui só se monta o
 * e-mail e se envia. A assinatura só é marcada como avisada depois de um envio que deu certo.
 */

/** Dias de antecedência do aviso. */
export const TRIAL_ENDING_DAYS = 2;

export interface TrialEndingNotice {
  subscriptionId: string;
  companyId: string;
  ownerEmail: string;
  ownerName: string | null;
  /** Último dia do teste, YYYY-MM-DD. */
  trialEndsOn: string;
}

export interface TrialEndingRepository {
  listPending(days: number): Promise<TrialEndingNotice[]>;
  markNotified(subscriptionId: string): Promise<void>;
}

/** "Maria da Silva" vira "Maria"; sem nome, a saudação fica sem ele. */
function firstName(fullName: string | null): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** O e-mail: saudação, quando o teste termina, incentivo a continuar e o botão para entrar. */
export function trialEndingEmail(notice: Pick<TrialEndingNotice, "ownerName" | "trialEndsOn">, appUrl: string): Omit<EmailMessage, "to" | "replyTo"> {
  const base = appUrl.replace(/\/+$/, "");
  const loginUrl = `${base}/login`;
  const name = firstName(notice.ownerName);
  const greeting = name ? `Olá, ${name}!` : "Olá!";
  const date = formatDate(notice.trialEndsOn);
  const subject = `Seu teste grátis do ${brand.name} acaba em ${TRIAL_ENDING_DAYS} dias`;
  const intro = `Esperamos que você esteja gostando do ${brand.name}. Seu período de teste grátis termina em ${date}, daqui a ${TRIAL_ENDING_DAYS} dias.`;
  const keep = "Seus orçamentos, sua agenda e seu financeiro continuam do jeito que você deixou. É só seguir usando.";
  const help = "Qualquer dúvida, é só responder este e-mail.";

  const text = [greeting, intro, keep, `Entrar no ${brand.name}: ${loginUrl}`, help].join("\n\n");
  const html = renderEmailLayout({
    appUrl: base,
    title: `Seu teste grátis acaba em ${TRIAL_ENDING_DAYS} dias`,
    preheader: `Seu período de teste grátis termina em ${date}.`,
    bodyHtml: [
      emailParagraph(escapeHtml(greeting)),
      emailParagraph(`Esperamos que você esteja gostando do ${escapeHtml(brand.name)}. Seu período de teste grátis termina em <strong>${escapeHtml(date)}</strong>, daqui a ${TRIAL_ENDING_DAYS} dias.`),
      emailParagraph(escapeHtml(keep)),
    ].join("\n"),
    button: { label: `Entrar no ${brand.name}`, url: loginUrl },
    footnote: help,
  });
  return { subject, text, html };
}

export interface TrialEndingRun {
  /** Testes que acabam em 2 dias e ainda não tinham sido avisados. */
  subscriptions: number;
  /** E-mails enviados. */
  sent: number;
  /** Assinaturas em que nenhum envio deu certo; ficam sem marca. */
  failed: number;
  /** E-mail enviado, mas a marca de "avisado" não gravou (não repete: no dia seguinte a data já não bate). */
  unmarked: number;
}

export function createTrialEndingService({
  repo,
  provider,
  appUrl,
  replyTo,
}: {
  repo: TrialEndingRepository;
  provider: EmailProvider;
  appUrl: string;
  /** Endereço que recebe as respostas (suporte). */
  replyTo?: string;
}) {
  return {
    async run(): Promise<TrialEndingRun> {
      const notices = await repo.listPending(TRIAL_ENDING_DAYS);
      const bySubscription = new Map<string, TrialEndingNotice[]>();
      for (const notice of notices) bySubscription.set(notice.subscriptionId, [...(bySubscription.get(notice.subscriptionId) ?? []), notice]);

      const run: TrialEndingRun = { subscriptions: bySubscription.size, sent: 0, failed: 0, unmarked: 0 };
      for (const [subscriptionId, owners] of bySubscription) {
        // Um e-mail por proprietário, e ninguém vê o endereço dos outros.
        const byEmail = new Map<string, TrialEndingNotice>();
        for (const owner of owners) if (!byEmail.has(owner.ownerEmail.toLowerCase())) byEmail.set(owner.ownerEmail.toLowerCase(), owner);
        const unique = [...byEmail.values()];
        const results = await Promise.allSettled(
          unique.map((owner) => provider.send({ to: owner.ownerEmail, ...trialEndingEmail(owner, appUrl), ...(replyTo ? { replyTo } : {}) })),
        );
        const delivered = results.filter((result) => result.status === "fulfilled").length;
        if (delivered === 0) {
          run.failed += 1;
          continue;
        }
        run.sent += delivered;
        // Já foi enviado: uma falha ao marcar não pode parar o envio para as demais assinaturas.
        await repo.markNotified(subscriptionId).catch(() => {
          run.unmarked += 1;
        });
      }
      return run;
    },
  };
}

export type TrialEndingService = ReturnType<typeof createTrialEndingService>;
