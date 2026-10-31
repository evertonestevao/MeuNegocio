import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricTone = "info" | "success" | "warning" | "danger";

const ICON_TONE: Record<MetricTone, string> = {
  info: "bg-info/12 text-info dark:bg-info/20",
  success: "bg-success/12 text-success dark:bg-success/20",
  warning: "bg-warning/12 text-warning dark:bg-warning/20",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
};

const VALUE_TONE: Partial<Record<MetricTone, string>> = {
  danger: "text-destructive",
  success: "text-success",
};

/** Card de métrica do dashboard (grid responsivo, plano §11). */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  toneValue = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  /** Cor do ícone. Sem tom, o card fica neutro. */
  tone?: MetricTone;
  /** Pinta também o valor, quando a cor diz algo sobre ele, como um saldo negativo. */
  toneValue?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 truncate text-2xl font-semibold tabular-nums", toneValue && tone && VALUE_TONE[tone])}>{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {tone ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
            <Icon className="size-5" aria-hidden />
          </span>
        ) : (
          <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </CardContent>
    </Card>
  );
}
