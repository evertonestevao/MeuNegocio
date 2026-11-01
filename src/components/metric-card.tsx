import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricTone = "info" | "success" | "warning" | "danger";

const TOP_BAR: Record<MetricTone, string> = {
  info: "border-t-4 border-t-info",
  success: "border-t-4 border-t-success",
  warning: "border-t-4 border-t-warning",
  danger: "border-t-4 border-t-destructive",
};

const ICON_COLOR: Record<MetricTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const VALUE_TONE: Partial<Record<MetricTone, string>> = {
  danger: "text-destructive",
  success: "text-success",
};

/** Card de número: compacto, para caber em duas colunas no celular. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "info",
  toneValue = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: MetricTone;
  /** Pinta também o valor, quando a cor diz algo sobre ele, como um saldo negativo. */
  toneValue?: boolean;
}) {
  return (
    <Card className={cn("relative h-full gap-0 overflow-hidden py-3 sm:py-4", TOP_BAR[tone])}>
      <CardContent className="flex flex-col gap-1.5 px-3 pt-1 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-[11px] leading-tight font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
          <Icon className={cn("size-4 shrink-0", ICON_COLOR[tone])} aria-hidden />
        </div>
        <p className={cn("font-heading text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl", toneValue && VALUE_TONE[tone])}>{value}</p>
        {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
