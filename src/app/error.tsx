"use client";

import { Button } from "@/components/ui/button";

/** Sem este arquivo, o Next mostra a própria tela de erro, em inglês. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Não foi possível abrir esta página</h1>
      <p className="text-muted-foreground">Tente de novo. Se continuar, volte em alguns minutos.</p>
      <Button onClick={reset}>Tentar de novo</Button>
    </main>
  );
}
