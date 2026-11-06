"use client";

import { startTransition, useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyProfileFields } from "@/features/company/components/company-profile-fields";
import { OwnershipDeclaration } from "@/features/company/components/ownership-declaration";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { createCompanyAction } from "@/server/actions/tenant";
import type { ActionState } from "@/server/actions/action-state";
import { companyProfileSchema, DEFAULT_COMPANY_PROFILE } from "@/services/companyProfileService";

export function CreateCompanyForm({
  requireTerms = false,
  withProfile = false,
}: {
  requireTerms?: boolean;
  /** Onboarding: pede também os dados usados em orçamentos e no PDF. */
  withProfile?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState | undefined, data: FormData): Promise<ActionState> => {
      if (withProfile) {
        const parsed = companyProfileSchema.safeParse(Object.fromEntries(data));
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      }
      return createCompanyAction(prev, data);
    },
    undefined,
  );

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
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome da empresa</Label>
        <Input id="name" name="name" placeholder="Minha Empresa" minLength={2} required />
      </div>
      {withProfile ? (
        <>
          <p className="text-sm text-muted-foreground">
            Estes dados aparecem nos orçamentos. Só o nome é obrigatório, e você pode completar o resto
            depois em Configurações.
          </p>
          <CompanyProfileFields profile={DEFAULT_COMPANY_PROFILE} />
        </>
      ) : null}
      {/* Onboarding (1º acesso): aceite dos termos vigentes antes de criar.
          O required do checkbox é UX; a validação real é na server action. */}
      {requireTerms ? <TermsCheckboxes /> : null}
      <OwnershipDeclaration />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar empresa"}
      </Button>
    </form>
  );
}
