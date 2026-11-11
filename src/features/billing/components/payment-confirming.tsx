"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscriptionConfirmationStatus } from "@/server/actions/billing";

/**
 * Depois de pagar, o gateway devolve o cliente aqui na hora, mas a ativação vem do webhook, que é
 * assíncrono. Esta tela espera a assinatura ativar (consultando em intervalos) e então leva ao
 * próximo passo. Se demorar demais, explica que a cobrança foi recebida e que a confirmação chega.
 */
export function PaymentConfirming() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const tries = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      if (!active) return;
      tries.current += 1;
      try {
        const status = await subscriptionConfirmationStatus();
        if (!active) return;
        if (status.active) {
          router.replace(status.next);
          return;
        }
      } catch {
        // rede/timeout: tenta de novo
      }
      if (tries.current >= 20) {
        setSlow(true);
        return;
      }
      timer = setTimeout(check, 2500);
    }

    check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      {slow ? (
        <>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Pagamento recebido</h1>
          <p className="max-w-md text-muted-foreground">
            A confirmação do seu pagamento pode levar alguns minutos. Você pode continuar: assim que ela chegar,
            o acesso é liberado.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => {
                tries.current = 0;
                setSlow(false);
              }}
            >
              Verificar de novo
            </Button>
            <Button variant="outline" onClick={() => router.replace("/dashboard")}>
              Ir para o sistema
            </Button>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Confirmando pagamento…</h1>
          <p className="max-w-md text-muted-foreground">
            Estamos confirmando sua assinatura. É só um instante — não feche esta página.
          </p>
        </>
      )}
    </div>
  );
}
