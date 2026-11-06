import { Check } from "lucide-react";

const STEPS = ["Seus dados", "Senha", "Assinatura", "Sua empresa"];

/** Onde a pessoa está no cadastro. Passo atual começa em 1. */
export function SignupSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Etapas do cadastro" className="flex items-center gap-2 text-xs font-medium">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const on = step === current;
        return (
          <li key={label} aria-current={on ? "step" : undefined} className="flex min-w-0 items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${done || on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : step}
            </span>
            <span className={`truncate ${on ? "text-foreground" : "hidden text-muted-foreground sm:inline"}`}>{label}</span>
            {step < STEPS.length ? <span className="h-px w-4 shrink-0 bg-border sm:w-6" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
