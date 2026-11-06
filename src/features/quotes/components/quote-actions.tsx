"use client";

import { startTransition, useActionState, useState } from "react";
import { CalendarDays, Copy, Download, Link2, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { DialogForm } from "@/components/dialog-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import {
  deleteQuoteAction,
  duplicateQuoteAction,
  transitionQuoteAction,
  undoCloseQuoteAction,
} from "@/server/actions/quotes";
import type { ActionState } from "@/server/actions/action-state";
import type { Quote, Revenue } from "@/types/database";
import type { CardFees } from "@/types/finance";
import type { QuoteDocument } from "@/types/quotes";
import { CloseQuoteButton } from "./close-quote-button";
import { downloadQuotePdf, printQuotePdf, quoteShareText, whatsappUrl } from "../pdf";

type Action = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

function ActionButton({
  action,
  quoteId,
  fields,
  label,
  variant = "outline",
}: {
  action: Action;
  quoteId: string;
  fields?: Record<string, string>;
  label: string;
  variant?: "default" | "outline";
}) {
  const [state, dispatch, pending] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await action(prev, data);
    if (result?.success) toast.success(result.success);
    return result;
  }, undefined);

  return (
    <>
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        variant={variant}
        disabled={pending}
        onClick={() => {
          const data = new FormData();
          data.set("quoteId", quoteId);
          for (const [key, value] of Object.entries(fields ?? {})) data.set(key, value);
          startTransition(() => dispatch(data));
        }}
      >
        {pending ? "Aguarde..." : label}
      </Button>
    </>
  );
}

function ConfirmButton({
  quoteId,
  action,
  fields,
  title,
  description,
  label,
  variant,
}: {
  quoteId: string;
  action: Action;
  fields?: Record<string, string>;
  title: string;
  description: string;
  label: string;
  variant?: "destructive";
}) {
  return (
    <DialogForm
      title={title}
      description={description}
      action={action}
      submitLabel={label}
      variant={variant}
      trigger={(open) => (
        <Button variant="outline" className={variant ? "text-destructive" : undefined} onClick={open}>
          {label}
        </Button>
      )}
    >
      <input type="hidden" name="quoteId" value={quoteId} />
      {Object.entries(fields ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </DialogForm>
  );
}

export function QuoteActions({
  quote,
  document,
  contact,
  publicUrl,
  revenue,
  canClose,
  canDelete,
  today,
  cardFees,
}: {
  quote: Quote;
  document: QuoteDocument;
  contact: { name: string; phone: string | null } | null;
  /** Null quando o plano não libera o link de aprovação. */
  publicUrl: string | null;
  revenue: Revenue | null;
  canClose: boolean;
  canDelete: boolean;
  today: string;
  cardFees?: CardFees;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const shareUrl = quote.status === "draft" || quote.status === "sent" ? publicUrl : null;
  const text = quoteShareText(document, contact?.name ?? null, shareUrl);
  // O link só abre depois de enviado. O WhatsApp marca como enviado, mas copiar não: no rascunho,
  // o texto copiado vai sem o link, para o cliente não receber um endereço que dá erro.
  const copyText = quote.status === "draft" ? quoteShareText(document, contact?.name ?? null, null) : text;
  const copyMessage = quote.status === "draft" && publicUrl ? "Texto copiado, sem o link: ele só abre depois de marcar como enviado" : "Texto copiado";
  const canSend = quote.status === "draft" && quote.client_id !== null;

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(message);
      toast.success(message);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  function markSentInBackground() {
    if (quote.status !== "draft") return;
    const data = new FormData();
    data.set("quoteId", quote.id);
    data.set("action", "send");
    startTransition(async () => {
      const result = await transitionQuoteAction(undefined, data);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        {quote.status === "draft" ? (
          <>
            <p className="text-xs text-muted-foreground">Salve o rascunho antes de enviar: o que vale é o último salvo.</p>
            <ActionButton action={transitionQuoteAction} quoteId={quote.id} fields={{ action: "send" }} label="Marcar como enviado" variant="default" />
            <ConfirmButton quoteId={quote.id} action={transitionQuoteAction} fields={{ action: "refuse" }} title="Cliente recusou" description="Marcar este orçamento como recusado? Recusado é final." label="Marcar como recusado" />
          </>
        ) : null}

        {quote.status === "sent" ? (
          <>
            <p className="text-sm font-medium">Aguardando o cliente</p>
            {publicUrl ? (
              <>
                <p className="text-xs text-muted-foreground">Ele pode aprovar pelo link. A resposta aparece aqui.</p>
                <Button variant="outline" onClick={() => copy(publicUrl, "Link de aprovação copiado")}>
                  <Link2 className="size-4" /> Copiar link de aprovação
                </Button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="text-center text-sm underline">
                  Ver como o cliente
                </a>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">O link de aprovação não está incluído no seu plano.</p>
            )}
            <ConfirmButton quoteId={quote.id} action={transitionQuoteAction} fields={{ action: "approve" }} title="Cliente aprovou" description="Registrar que o cliente aprovou este orçamento?" label="Cliente aprovou" />
            <ConfirmButton quoteId={quote.id} action={transitionQuoteAction} fields={{ action: "refuse" }} title="Cliente recusou" description="Marcar este orçamento como recusado pelo cliente? Recusado é final." label="Cliente recusou" />
            <ConfirmButton quoteId={quote.id} action={transitionQuoteAction} fields={{ action: "expire" }} title="Marcar como expirado" description="Marcar como expirado? Depois você pode reabrir com nova validade." label="Marcar como expirado" />
          </>
        ) : null}

        {(quote.status === "approved" || quote.status === "closed") && quote.client_id ? (
          <Button variant="outline" render={<a href={`/dashboard/schedule?new=1&quote=${quote.id}`} />} nativeButton={false}>
            <CalendarDays className="size-4" /> Agendar execução
          </Button>
        ) : null}

        {quote.status === "approved" && canClose ? (
          <CloseQuoteButton quoteId={quote.id} totalCents={quote.total_cents} today={today} paymentPlan={quote.payment_plan ?? null} cardFees={cardFees} />
        ) : null}
        {quote.status === "approved" && !canClose ? (
          <p className="text-sm text-muted-foreground">Aprovado. O fechamento é feito por owner ou admin.</p>
        ) : null}

        {quote.status === "closed" ? (
          <>
            <p className="text-sm font-medium">Faturado</p>
            {revenue ? (
              <p className="text-sm text-muted-foreground">
                {formatCents(revenue.amount_cents)} em {formatDate(revenue.competence_date)}
              </p>
            ) : null}
            {canClose ? (
              <ConfirmButton quoteId={quote.id} action={undoCloseQuoteAction} title="Desfazer fechamento" description="Desfazer o fechamento? O valor sai do faturamento e o orçamento volta para Aprovado." label="Desfazer fechamento" />
            ) : null}
          </>
        ) : null}

        {quote.status === "expired" ? (
          <DialogForm
            title="Reabrir como rascunho"
            description="Informe a nova validade do orçamento."
            action={transitionQuoteAction}
            submitLabel="Reabrir"
            trigger={(open) => <Button onClick={open}>Reabrir como rascunho</Button>}
          >
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="action" value="reopen" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reopen-valid">Nova validade</Label>
              <Input id="reopen-valid" name="validUntil" type="date" min={today} />
            </div>
          </DialogForm>
        ) : null}

        <hr className="my-1" />
        <Button variant="outline" onClick={() => void downloadQuotePdf(document)}>
          <Download className="size-4" /> Baixar PDF
        </Button>
        <Button variant="outline" onClick={() => void printQuotePdf(document)}>
          <Printer className="size-4" /> Imprimir
        </Button>
        {canSend || quote.status === "sent" ? (
          <Button
            variant="outline"
            render={<a href={whatsappUrl(contact?.phone ?? null, text)} target="_blank" rel="noreferrer" onClick={markSentInBackground} />}
            nativeButton={false}
          >
            <MessageCircle className="size-4" /> Enviar pelo WhatsApp
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => copy(copyText, copyMessage)}>
          <Copy className="size-4" /> {copied === copyMessage ? "Texto copiado" : "Copiar texto"}
        </Button>
        <ActionButton action={duplicateQuoteAction} quoteId={quote.id} label="Duplicar" />
        {canDelete && ["draft", "refused", "expired"].includes(quote.status) ? (
          <ConfirmButton quoteId={quote.id} action={deleteQuoteAction} title="Excluir orçamento" description="Excluir este orçamento? Essa ação não pode ser desfeita pelo sistema." label="Excluir orçamento" variant="destructive" />
        ) : null}
      </CardContent>
    </Card>
  );
}
