import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { DeltaDirection, DeltaTone, OverviewDelta, OverviewTile } from "@/services/adminOverviewService";

/** A cor diz se a mudança é boa ou ruim; a seta diz para onde o número foi. */
const TONE_CLASS: Record<DeltaTone, { className: string; sentence: string }> = {
  good: { className: "text-success", sentence: "melhor" },
  bad: { className: "text-destructive", sentence: "pior" },
  neutral: { className: "text-muted-foreground", sentence: "igual" },
};
const DIRECTION_ICON: Record<DeltaDirection, typeof Minus> = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

/** Diferença com o período anterior: sinal, seta e texto, nunca só a cor. */
function Delta({ delta }: { delta: OverviewDelta }) {
  const style = TONE_CLASS[delta.tone];
  const Icon = DIRECTION_ICON[delta.direction];
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${style.className}`}>
        <Icon className="size-4" aria-hidden />
        {delta.change}
        <span className="sr-only"> ({style.sentence})</span>
      </span>
      <span className="text-muted-foreground">{delta.reference}</span>
    </p>
  );
}

/** Os indicadores do topo da Visão geral: rótulo, número grande e, quando faz sentido, a comparação. */
export function OverviewTiles({ tiles }: { tiles: OverviewTile[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile) => (
        <li
          key={tile.key}
          className={`flex flex-col gap-1.5 rounded-xl border bg-card p-4 ${tile.alert ? "border-destructive/50" : ""}`}
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {tile.alert ? <AlertTriangle className="size-4 text-destructive" aria-hidden /> : null}
            {tile.label}
          </p>
          <p className="font-heading text-3xl font-extrabold tracking-tight tabular-nums">{tile.value}</p>
          {tile.delta ? <Delta delta={tile.delta} /> : null}
          {tile.hint ? <p className="text-sm text-muted-foreground">{tile.hint}</p> : null}
        </li>
      ))}
    </ul>
  );
}
