"use client";

import { startTransition, useActionState } from "react";
import { ChevronDown } from "lucide-react";
import { MaskedInput } from "@/components/masked-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyLogoField } from "@/features/company/components/company-logo-field";
import { OwnershipDeclaration } from "@/features/company/components/ownership-declaration";
import { TIMEZONE_LABEL } from "@/features/company/components/company-profile-fields";
import { completeOnboardingAction } from "@/server/actions/signup";
import type { ActionState } from "@/server/actions/action-state";
import { COMPANY_TIMEZONES, DEFAULT_COMPANY_PROFILE } from "@/services/companyProfileService";

/**
 * Último passo do cadastro: só o que o orçamento precisa para sair com a cara da empresa. O resto
 * fica recolhido e pode ser preenchido depois em Configurações.
 */
export function CompleteCompanyForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, dispatch, pending] = useActionState(
    (prev: ActionState | undefined, data: FormData) => completeOnboardingAction(prev, data),
    undefined,
  );

  const errors = state?.fieldErrors ?? {};
  // Erro em campo recolhido: abre "Mais dados" para a pessoa ver onde está.
  const hiddenFieldError = Boolean(errors.email || errors.address || errors.timezone);
  const invalid = (field: string) =>
    errors[field] ? { "aria-invalid": true as const, "aria-describedby": `${field}-error` } : {};

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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome da empresa</Label>
        <Input id="name" name="name" placeholder="Ex.: Clima Sul Refrigeração" minLength={2} maxLength={80} required autoFocus {...invalid("name")} />
        <FieldError field="name" message={errors.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-phone">Telefone ou WhatsApp</Label>
          <MaskedInput mask="phone" id="profile-phone" name="phone" required {...invalid("phone")} />
          <FieldError field="phone" message={errors.phone} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-cnpj">
            CNPJ <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <MaskedInput mask="cnpj" id="profile-cnpj" name="cnpj" {...invalid("cnpj")} />
          <FieldError field="cnpj" message={errors.cnpj} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Nome e telefone aparecem nos orçamentos que você mandar para os clientes.</p>

      <details className="group rounded-lg border px-3 py-2" open={hiddenFieldError || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-medium">
          Mais dados (opcional)
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-4 pt-3 pb-1">
          <CompanyLogoField initialUrl={logoUrl} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-email">E-mail da empresa</Label>
              <Input id="profile-email" name="email" type="email" {...invalid("email")} />
              <FieldError field="email" message={errors.email} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-timezone">Fuso</Label>
              <select
                id="profile-timezone"
                name="timezone"
                defaultValue={DEFAULT_COMPANY_PROFILE.timezone}
                className="border-input h-11 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 dark:bg-input/30"
              >
                {COMPANY_TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {TIMEZONE_LABEL[timezone]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-address">Endereço</Label>
            <Input id="profile-address" name="address" {...invalid("address")} />
            <FieldError field="address" message={errors.address} />
          </div>
        </div>
      </details>
      <input type="hidden" name="quoteValidityDays" value={DEFAULT_COMPANY_PROFILE.quote_validity_days} />
      <input type="hidden" name="targetMarginPercent" value={DEFAULT_COMPANY_PROFILE.target_margin_percent} />
      <input type="hidden" name="quoteDefaultNotes" value="" />

      <OwnershipDeclaration />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Concluir e entrar no sistema"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Logo, validade do orçamento e observações padrão você ajusta depois em Configurações.</p>
    </form>
  );
}

function FieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${field}-error`} className="text-xs text-destructive">
      {message}
    </p>
  );
}
