import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatDate } from "@/lib/dates";

/** Dias que faltam do teste, contados por dia: termina hoje é 0. */
export function trialDaysLeft(endsAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 86_400_000));
}

/** Faixa do teste sem cartão: quantos dias faltam e, para o proprietário, o atalho para assinar. */
export function TrialBanner({ endsAt, canSubscribe }: { endsAt: string; canSubscribe: boolean }) {
  const days = trialDaysLeft(endsAt);
  const when = days <= 1 ? "Último dia do seu teste grátis" : `Faltam ${days} dias do seu teste grátis`;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" />
        {when} (até {formatDate(endsAt.slice(0, 10))}).
      </span>
      {canSubscribe ? (
        <Link href="/assinar" className="font-semibold text-primary hover:underline">
          Assinar agora
        </Link>
      ) : null}
    </div>
  );
}
