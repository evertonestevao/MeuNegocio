"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Download } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { respondPublicQuoteAction } from "@/server/actions/quotes";
import type { QuoteDocument } from "@/types/quotes";
import { downloadQuotePdf } from "../pdf";
import { publicResponseSchema } from "../schemas";

export function PublicQuotePdfButton({ document }: { document: QuoteDocument }) {
  return (
    <Button variant="outline" onClick={() => void downloadQuotePdf(document)}>
      <Download className="size-4" /> Baixar PDF
    </Button>
  );
}

export function PublicQuoteResponseForm({ token, companyName }: { token: string; companyName: string }) {
  const [refusing, setRefusing] = useState(false);
  const signature = useRef<SignaturePadHandle>(null);
  const [state, dispatch, pending] = useActionState(
    async (_prev: { error?: string } | undefined, data: FormData) => {
      const parsed = publicResponseSchema.safeParse({
        decision: data.get("decision"),
        name: data.get("name"),
        comment: data.get("comment") ?? "",
      });
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      if (parsed.data.decision === "approved") {
        const blob = await signature.current?.toBlob();
        if (!blob) return { error: "Assine no quadro para aprovar o orçamento." };
        data.set("signature", blob, "assinatura.png");
      }
      return respondPublicQuoteAction(undefined, data);
    },
    undefined,
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("decision", refusing ? "refused" : "approved");
        startTransition(() => dispatch(data));
      }}
    >
      <h2 className="text-lg font-semibold">{refusing ? "Não aprovar o orçamento" : "Aprovar orçamento"}</h2>
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="response-name">Seu nome</Label>
        <Input id="response-name" name="name" autoComplete="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="response-comment">{refusing ? "Motivo" : "Comentário (opcional)"}</Label>
        <textarea
          id="response-comment"
          name="comment"
          className="border-input min-h-20 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>
      {refusing ? null : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Sua assinatura</span>
          <SignaturePad ref={signature} label="Sua assinatura" />
          <span className="text-xs text-muted-foreground">Assine com o dedo ou o mouse.</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} variant={refusing ? "destructive" : "default"}>
          {pending ? "Enviando..." : refusing ? "Enviar recusa" : "Aprovar orçamento"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setRefusing((current) => !current)}>
          {refusing ? "Quero aprovar" : "Não vou aprovar"}
        </Button>
      </div>
      {refusing ? null : (
        <p className="text-sm text-muted-foreground">
          Ao aprovar, a {companyName} recebe o aviso e entra em contato para agendar o serviço.
        </p>
      )}
    </form>
  );
}
