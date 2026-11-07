import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuoteHistoryEntry } from "@/types/database";
import { quoteHistoryLine } from "../history";

/** O que aconteceu com o orçamento: quem criou, enviou, aprovou, cancelou e em nome de quem. */
export function QuoteHistory({ entries, timezone }: { entries: QuoteHistoryEntry[]; timezone: string }) {
  return (
    <Card role="region" aria-label="Histórico do orçamento">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden /> Histórico
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ol className="flex flex-col">
            {entries.map((entry, index) => {
              const line = quoteHistoryLine(entry, timezone);
              return (
                <li key={`${entry.created_at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className="relative flex w-3 shrink-0 justify-center" aria-hidden>
                    <span className="mt-1.5 size-2.5 rounded-full bg-primary" />
                    {index < entries.length - 1 ? <span className="absolute top-4 bottom-[-0.25rem] w-px bg-border" /> : null}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <p>
                      <span className="font-medium">{line.title}</span>
                      <span className="text-muted-foreground"> · {line.at}</span>
                    </p>
                    {line.by ? <p className="text-muted-foreground">{line.by}</p> : null}
                    {line.requestedBy ? <p className="break-words">{line.requestedBy}</p> : null}
                    {line.note ? <p className="break-words text-muted-foreground">{line.note}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
