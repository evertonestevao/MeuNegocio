"use client";

import { startTransition, useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ABUSE_REASONS } from "@/features/company/declaration";
import { reportAbuseAction } from "@/server/actions/abuseReports";

const FIELD = "border-input w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Formulário de denúncia. Com token, a empresa e o orçamento vêm do link; sem, a pessoa informa a empresa. */
export function AbuseReportForm({ token, companyName }: { token: string | null; companyName: string | null }) {
  const [state, dispatch, pending] = useActionState(reportAbuseAction, undefined);

  if (state?.success) {
    return (
      <Alert>
        <AlertDescription>{state.success}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      // onSubmit em vez de action: um erro não apaga o que já foi digitado.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-4"
    >
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {token ? <input type="hidden" name="token" value={token} /> : null}
      {companyName ? (
        <p className="text-sm">
          Empresa: <strong>{companyName}</strong>
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-company">Nome ou CNPJ da empresa denunciada</Label>
          <Input id="report-company" name="companyName" maxLength={200} />
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Motivo</legend>
        {Object.entries(ABUSE_REASONS).map(([value, label], index) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="reason" value={value} required defaultChecked={index === 0} className="mt-0.5 size-4 accent-primary" />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-message">O que aconteceu?</Label>
        <textarea id="report-message" name="message" required minLength={10} maxLength={2000} rows={5} className={FIELD} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-name">
            Seu nome <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input id="report-name" name="reporterName" maxLength={120} autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-contact">E-mail ou telefone para contato</Label>
          <Input id="report-contact" name="reporterContact" required minLength={5} maxLength={200} />
        </div>
      </div>
      {/* Campo isca: invisível para pessoas, robôs costumam preencher. */}
      <div className="absolute -left-[9999px] size-px overflow-hidden" aria-hidden>
        <label htmlFor="report-website">Site</label>
        <input id="report-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-xs text-muted-foreground">Guardamos a denúncia com data e IP. Usamos seu contato só para falar sobre ela.</p>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Enviando..." : "Enviar denúncia"}
      </Button>
    </form>
  );
}
