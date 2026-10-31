import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_TIMEZONES } from "@/services/companyProfileService";
import type { CompanyProfile } from "@/types/database";

const TIMEZONE_LABEL: Record<(typeof COMPANY_TIMEZONES)[number], string> = {
  "America/Sao_Paulo": "Brasília",
  "America/Manaus": "Manaus",
  "America/Cuiaba": "Cuiabá",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
};

/** Campos dos dados da empresa, usados no onboarding e nas configurações. */
export function CompanyProfileFields({ profile }: { profile: Omit<CompanyProfile, "company_id"> }) {
  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-cnpj">CNPJ</Label>
        <MaskedInput mask="cnpj" id="profile-cnpj" name="cnpj" defaultValue={profile.cnpj ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-phone">Telefone</Label>
        <MaskedInput mask="phone" id="profile-phone" name="phone" defaultValue={profile.phone ?? ""} />
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
    </>
  );
}
