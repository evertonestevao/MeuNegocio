import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReceivableList } from "@/features/receivables/components/receivable-list";
import { addMonths, formatMonth, isValidDate } from "@/lib/calendar";
import { addDays, todayInTimezone } from "@/lib/dates";
import { summarizeOpen } from "@/lib/installments";
import { formatCents } from "@/lib/money";
import { getCompanyProfileService } from "@/server/quotes";
import { getReceivableService } from "@/server/receivables";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Contas a receber" };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ tab?: string; m?: string }> }) {
  const { tab, m } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageFinance(active.role)) redirect("/dashboard");

  const actor = { companyId: active.id, role: active.role };
  const { timezone } = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(timezone);
  const received = tab === "recebidos";
  const month = isValidDate(`${m}-01`) ? `${m}-01` : `${today.slice(0, 7)}-01`;
  const service = await getReceivableService();
  const open = await service.listOpen(actor);
  const totals = summarizeOpen(open, today);
  const receivedItems = received ? await service.listReceived(actor, month, addDays(addMonths(month, 1), -1)) : [];
  const receivedTotal = receivedItems.reduce((sum, item) => sum + (item.received_cents ?? 0), 0);

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5 ${on ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted"}`;
  const monthHref = (target: string) => `/dashboard/finance/recebimentos?tab=recebidos&m=${target.slice(0, 7)}`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/dashboard/finance" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Financeiro
      </Link>
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Contas a receber</h2>
        <p className="text-sm text-muted-foreground">As parcelas dos serviços fechados. Registre cada uma quando o dinheiro entrar.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-muted-foreground">A receber</span>
            <strong className="font-heading text-lg tabular-nums">{formatCents(totals.openCents)}</strong>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-muted-foreground">Atrasado</span>
            <strong className={`font-heading text-lg tabular-nums ${totals.overdueCents > 0 ? "text-destructive" : ""}`}>{formatCents(totals.overdueCents)}</strong>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-muted-foreground">Em 7 dias</span>
            <strong className="font-heading text-lg tabular-nums">{formatCents(totals.dueSoonCents)}</strong>
          </CardContent>
        </Card>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Situação das parcelas">
        <Link scroll={false} href="/dashboard/finance/recebimentos" className={chip(!received)}>
          A receber <span className="ml-1 text-xs opacity-70">{totals.openCount}</span>
        </Link>
        <Link scroll={false} href="/dashboard/finance/recebimentos?tab=recebidos" className={chip(received)}>
          Recebidos
        </Link>
      </nav>

      {received ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={monthHref(addMonths(month, -1))} aria-label="Mês anterior" />} nativeButton={false}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
          <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={monthHref(addMonths(month, 1))} aria-label="Próximo mês" />} nativeButton={false}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Recebido no mês: <strong className="text-foreground tabular-nums">{formatCents(receivedTotal)}</strong>
          </span>
        </div>
      ) : null}

      <Card>
        <CardContent>
          {received ? (
            <ReceivableList items={receivedItems} today={today} empty="Nada recebido neste mês." />
          ) : (
            <ReceivableList items={open} today={today} empty="Nenhuma parcela a receber. Tudo em dia." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
