"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscriptionConfirmationStatus } from "@/server/actions/billing";

/**
 * Depois do checkout, o gateway devolve o cliente aqui na hora, mas a ativação vem do webhook, que é
 * assíncrono. Esta tela espera a assinatura entrar (consultando em intervalos) e então leva ao
 * próximo passo sozinha. Se demorar demais, explica que a confirmação ainda pode chegar. Vale tanto
 * para assinatura paga quanto para teste grátis (onde nada é cobrado agora), por isso o texto é neutro.
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Estamos quase lá</h1>
          <p className="max-w-md text-muted-foreground">
            A confirmação da sua assinatura pode levar alguns minutos. Assim que chegar, seu acesso é
            liberado automaticamente — você não precisa fazer mais nada.
          </p>
          <Button
            onClick={() => {
              tries.current = 0;
              setSlow(false);
            }}
          >
            Verificar de novo
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Confirmando sua assinatura…</h1>
          <p className="max-w-md text-muted-foreground">
            É só um instante — não feche esta página. Vamos te levar para o próximo passo automaticamente.
          </p>
        </>
      )}
    </div>
  );
}
