"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FirstStep } from "@/services/firstStepsService";

const storageKey = (companyId: string) => `primeiros-passos-escondidos:${companyId}`;
const listeners = new Set<() => void>();

function readHidden(companyId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(companyId)) === "1";
  } catch {
    return false;
  }
}

/** O que falta para o primeiro orçamento sair com a cara da empresa. Some quando tudo foi feito. */
export function FirstStepsCard({ companyId, steps }: { companyId: string; steps: FirstStep[] }) {
  const hidden = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => readHidden(companyId),
    () => false,
  );
  if (hidden) return null;

  const done = steps.filter((step) => step.done).length;

  function hide() {
    try {
      window.localStorage.setItem(storageKey(companyId), "1");
    } catch {
      // Sem armazenamento no navegador, o cartão só volta a aparecer.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>Primeiros passos</CardTitle>
          <p className="text-sm text-muted-foreground">
            {done} de {steps.length} feitos. O que falta para o seu primeiro orçamento sair com a cara da empresa.
          </p>
        </div>
        <button type="button" onClick={hide} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Não mostrar mais
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Primeiros passos feitos">
          <div className="h-full rounded-full bg-success" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
        </div>
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.key}>
              <Link
                href={step.href}
                className={`flex h-full items-start gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50 ${step.done ? "opacity-70" : ""}`}
              >
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Feito" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="A fazer" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`font-medium ${step.done ? "line-through decoration-muted-foreground/60" : ""}`}>{step.label}</span>
                  <span className="text-xs text-muted-foreground">{step.hint}</span>
                </span>
                {step.done ? null : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
