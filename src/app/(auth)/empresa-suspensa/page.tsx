import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CompanySwitcher } from "@/components/app-shell/company-switcher";
import { brand } from "@/config/brand";
import { TenantProvider } from "@/providers/tenant-provider";
import { signOutAction } from "@/server/actions/auth";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Acesso suspenso" };

/**
 * Empresa suspensa pelo super admin. Não mostra o motivo interno (pode citar denúncia de terceiro):
 * só o caminho para falar com o suporte. Quem tem outra empresa pode trocar por aqui.
 */
export default async function SuspendedCompanyPage() {
  const { companies, active } = await getActiveTenant();
  if (!active?.suspended_at) redirect("/dashboard");

  return (
    <TenantProvider value={{ companies, active }}>
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Acesso suspenso</h1>
        <p className="text-base text-muted-foreground">
          O acesso da {active.name} ao {brand.name} está suspenso, e os links de orçamento dela não abrem enquanto isso. Os dados
          continuam guardados.
        </p>
        <p className="text-base text-muted-foreground">
          Se você é o responsável pela empresa, escreva para{" "}
          <a href={`mailto:${brand.legal.supportEmail}`} className="text-foreground underline underline-offset-4">
            {brand.legal.supportEmail}
          </a>
          .
        </p>
        <div className="flex flex-wrap items-center gap-3 border-t pt-5 text-sm text-muted-foreground">
          {companies.length > 1 ? <CompanySwitcher canCreate={false} /> : null}
          <form action={signOutAction}>
            <button type="submit" className="font-medium text-foreground underline underline-offset-4">
              Sair
            </button>
          </form>
        </div>
      </div>
    </TenantProvider>
  );
}
