import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import type { AttentionItem, AttentionTone } from "@/services/adminOverviewService";

const TONE: Record<AttentionTone, { label: string; className: string; icon: typeof Info }> = {
  critical: { label: "Urgente", className: "text-destructive", icon: AlertTriangle },
  warning: { label: "Atenção", className: "text-warning", icon: AlertTriangle },
  info: { label: "Acompanhar", className: "text-muted-foreground", icon: Info },
};

/** O que pede ação do super admin. Cada linha leva direto à tela onde se resolve. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="size-5 text-success" aria-hidden />
        Nada pedindo atenção agora.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => {
        const tone = TONE[item.tone];
        const Icon = tone.icon;
        return (
          <li key={item.key}>
            <Link href={item.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
              <Icon className={`size-5 shrink-0 ${tone.className}`} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{item.label}</span>
                <span className={`text-xs font-medium ${tone.className}`}>{tone.label}</span>
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums">{item.count}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
