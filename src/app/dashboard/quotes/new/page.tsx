import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { addDays, todayInTimezone } from "@/lib/dates";
import { companyTaxRate } from "@/lib/tax";
import { loadQuoteEditorData } from "@/server/quoteEditorData";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageQuotes(active.role)) redirect("/dashboard");

  const { clients, catalog, profile } = await loadQuoteEditorData({ companyId: active.id, role: active.role });
  const clientId = clients.some((option) => option.id === client) ? (client as string) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/quotes" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Orçamentos
        </Link>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Novo orçamento</h2>
      </div>
      <QuoteEditor
        quote={null}
        items={[]}
        canSeeCost={permissionService.canManageFinance(active.role)}
        taxRateBps={companyTaxRate(profile)}
        catalog={catalog}
        clients={clients}
        initial={{
          clientId,
          validUntil: addDays(todayInTimezone(profile.timezone), profile.quote_validity_days),
          notes: profile.quote_default_notes ?? "",
        }}
      />
    </div>
  );
}
