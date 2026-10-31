"use client";

import { startTransition, useActionState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CompanyProfileFields } from "@/features/company/components/company-profile-fields";
import { saveCompanyProfileAction } from "@/server/actions/companyProfile";
import { companyProfileSchema } from "@/services/companyProfileService";
import type { CompanyProfile } from "@/types/database";

export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const [state, dispatch, pending] = useActionState(
    async (prev: { error?: string } | undefined, data: FormData) => {
      const parsed = companyProfileSchema.safeParse(Object.fromEntries(data));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      const result = await saveCompanyProfileAction(undefined, data);
      if (result.success) toast.success(result.success);
      return result;
    },
    undefined,
  );

  return (
    <form
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
      <CompanyProfileFields profile={profile} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar dados"}
      </Button>
    </form>
  );
}
