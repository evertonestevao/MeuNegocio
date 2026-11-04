import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TAX_REGIME_LABEL, TAX_REGIMES, taxRateInput } from "@/lib/tax";
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
          className="border-input h-11 rounded-lg md:h-9 border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="profile-margin">Meta de margem dos serviços (%)</Label>
      <Input
        id="profile-margin"
        name="targetMarginPercent"
        inputMode="numeric"
        defaultValue={profile.target_margin_percent ?? 20}
        className="max-w-32"
      />
      <p className="text-xs text-muted-foreground">Abaixo dela, o resultado do serviço aparece em alerta. Só você e o administrador veem.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-tax-regime">Regime tributário</Label>
        <select
          id="profile-tax-regime"
          name="taxRegime"
          defaultValue={profile.tax_regime ?? ""}
          className="border-input h-11 rounded-lg md:h-9 border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">Não informado</option>
          {TAX_REGIMES.map((regime) => (
            <option key={regime} value={regime}>
              {TAX_REGIME_LABEL[regime]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-tax-rate">Imposto sobre o valor cobrado (%)</Label>
        <Input
          id="profile-tax-rate"
          name="taxRate"
          inputMode="decimal"
          placeholder="Ex.: 6 ou 8,43"
          defaultValue={profile.tax_rate_bps ? taxRateInput(profile.tax_rate_bps) : ""}
          className="max-w-32"
        />
      </div>
    </div>
    <p className="-mt-2 text-xs text-muted-foreground">
      Descontado do resultado de cada serviço como estimativa; você pode mudar a de um serviço específico. No Simples Nacional, use a
      alíquota efetiva do mês, que o contador informa. No MEI não há percentual: lance o DAS mensal como gasto fixo.
    </p>
    </>
  );
}
