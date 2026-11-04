import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyRevenuesForm } from "@/features/tax/components/monthly-revenues-form";
import { TaxSettingsForm } from "@/features/tax/components/tax-settings-form";
import { getTaxService } from "@/server/tax";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Impostos" };

export default async function TaxSettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageFinance(active.role)) redirect("/dashboard/settings");

  const tax = await (await getTaxService()).get({ companyId: active.id, role: active.role });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/dashboard/settings" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Configurações
      </Link>
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Impostos</h2>
        <p className="text-sm text-muted-foreground">
          Imposto estimado que sai do resultado de cada serviço. É uma estimativa para medir a margem: o valor oficial é o da guia apurada pelo contador. Só você e o
          administrador veem.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Regime e alíquota</CardTitle>
          <CardDescription>A alíquota vale para os serviços aprovados a partir de agora; cada serviço também pode ter a sua.</CardDescription>
        </CardHeader>
        <CardContent>
          <TaxSettingsForm key={`${tax.regime}-${tax.auto}-${tax.annex}`} tax={tax} />
        </CardContent>
      </Card>

      {tax.regime === "simples" && tax.detail ? (
        <Card>
          <CardHeader>
            <CardTitle>Faturamento dos últimos 12 meses</CardTitle>
            <CardDescription>
              {tax.auto ? "Base do cálculo da alíquota deste mês." : "Base da alíquota sugerida. Escolha \"Calcular pelo faturamento\" para usá-la nos serviços."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyRevenuesForm tax={tax} />
          </CardContent>
        </Card>
      ) : tax.regime === "simples" ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">Escolha o anexo e salve para ver a alíquota calculada pelo faturamento dos últimos 12 meses.</p>
      ) : null}
    </div>
  );
}
