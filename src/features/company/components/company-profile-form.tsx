"use client";

import { startTransition, useActionState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCompanyProfileAction } from "@/server/actions/companyProfile";
import { COMPANY_TIMEZONES, companyProfileSchema } from "@/services/companyProfileService";
import type { CompanyProfile } from "@/types/database";

const TIMEZONE_LABEL: Record<(typeof COMPANY_TIMEZONES)[number], string> = {
  "America/Sao_Paulo": "Brasília",
  "America/Manaus": "Manaus",
  "America/Cuiaba": "Cuiabá",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
};

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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-cnpj">CNPJ</Label>
          <Input id="profile-cnpj" name="cnpj" defaultValue={profile.cnpj ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-phone">Telefone</Label>
          <Input id="profile-phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">E-mail</Label>
          <Input id="profile-email" name="email" type="email" defaultValue={profile.email ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-timezone">Fuso</Label>
          <select
            id="profile-timezone"
            name="timezone"
            defaultValue={profile.timezone}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
        <Input id="profile-address" name="address" defaultValue={profile.address ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-validity">Validade padrão do orçamento (dias)</Label>
        <Input
          id="profile-validity"
          name="quoteValidityDays"
          inputMode="numeric"
          defaultValue={profile.quote_validity_days}
          className="max-w-32"
        />
        <p className="text-xs text-muted-foreground">Usada ao criar um orçamento novo.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-notes">Observações padrão</Label>
        <textarea
          id="profile-notes"
          name="quoteDefaultNotes"
          defaultValue={profile.quote_default_notes ?? ""}
          className="border-input min-h-20 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <p className="text-xs text-muted-foreground">Entram automaticamente em todo orçamento novo e no PDF.</p>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar dados"}
      </Button>
    </form>
  );
}
