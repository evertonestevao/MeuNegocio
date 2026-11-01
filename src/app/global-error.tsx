"use client";

/** Erro no próprio layout raiz: precisa trazer html e body. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <h1>Não foi possível abrir esta página</h1>
        <p>Tente de novo. Se continuar, volte em alguns minutos.</p>
        <button type="button" onClick={reset}>
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
