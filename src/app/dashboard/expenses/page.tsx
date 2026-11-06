import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Repeat, Tag, Wallet } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CategoryFormButton,
  DeleteCategoryButton,
  DeleteExpenseButton,
  DeleteTemplateButton,
  EditExpenseButton,
  EditTemplateButton,
  type ExpenseFormOptions,
  NewExpenseButton,
  NewTemplateButton,
  SupplierFormButton,
} from "@/features/expenses/components/expense-forms";
import { EXPENSE_KIND_LABEL, PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import { SupplierPanel } from "@/features/expenses/components/supplier-panel";
import { addMonths, formatLongDay, formatMonth, isValidDate, monthGrid } from "@/lib/calendar";
import { addDays, formatDate, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { generateMonthExpensesAction } from "@/server/actions/expenses";
import { getExpenseService } from "@/server/finance";
import { getCompanyProfileService } from "@/server/quotes";
import { getEmployeeService } from "@/server/schedule";
import { getServiceCostService } from "@/server/serviceCosts";
import { formatQuoteNumber } from "@/features/quotes/status";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";
import type { Expense } from "@/types/finance";

export const metadata: Metadata = { title: "Gastos" };

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ExpenseList({ items, options }: { items: Expense[]; options: ExpenseFormOptions }) {
  return (
    <ul className="flex flex-col divide-y">
      {items.map((expense) => (
        <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
            <span className="font-medium break-words">{expense.description}</span>
            <span className="text-xs text-muted-foreground">
              {[
                formatDate(expense.expense_date),
                expense.category_name,
                EXPENSE_KIND_LABEL[expense.kind],
                expense.supplier,
                expense.payment_method ? PAYMENT_METHOD_LABEL[expense.payment_method] : null,
                expense.quote_number ? `Serviço #${formatQuoteNumber(expense.quote_number)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{formatCents(expense.amount_cents)}</span>
            <div className="flex">
              {expense.kind === "contractor" ? null : <EditExpenseButton expense={expense} options={options} />}
              <DeleteExpenseButton expense={expense} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}


export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string; m?: string; d?: string; p?: string }>;
}) {
  const params = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageFinance(active.role)) redirect("/dashboard");

  const actor = { companyId: active.id, role: active.role };
  const profile = await (await getCompanyProfileService()).get(active.id);
  const today = todayInTimezone(profile.timezone);
  const month = isValidDate(`${params.m}-01`) ? `${params.m}-01` : `${today.slice(0, 7)}-01`;
  const lastDay = addDays(addMonths(month, 1), -1);
  const tab = params.tab === "recurring" || params.tab === "categories" || params.tab === "suppliers" ? params.tab : "entries";
  // Período das contas por fornecedor: últimos 3 meses, 12 meses ou tudo.
  const period = params.p === "3m" || params.p === "all" ? params.p : "12m";
  const periodStart = period === "all" ? null : addDays(today, period === "3m" ? -90 : -365);
  const view = params.view === "list" ? "list" : "calendar";

  const service = await getExpenseService();
  const [expenses, templates, categories, employees, quoteOptions, suppliers, supplierStats] = await Promise.all([
    service.list(actor, month, lastDay),
    service.listTemplates(actor),
    service.listCategories(actor),
    (await getEmployeeService()).list(actor, today),
    (await getServiceCostService()).listQuoteOptions(actor),
    service.listSuppliers(actor),
    tab === "suppliers" ? service.supplierStats(actor, periodStart) : Promise.resolve(null),
  ]);
  const options = {
    categories,
    employees: employees.map(({ id, name, active: isActive }) => ({ id, name, active: isActive })),
    quotes: quoteOptions,
    suppliers: suppliers.map(({ id, name }) => ({ id, name })),
  };
  const total = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const defaultDate = today.slice(0, 7) === month.slice(0, 7) ? today : month;
  const selected = isValidDate(params.d) && params.d.slice(0, 7) === month.slice(0, 7) ? params.d : null;
  const isFutureMonth = month > `${today.slice(0, 7)}-01`;

  function href(overrides: Record<string, string | undefined>): string {
    const merged: Record<string, string | undefined> = { tab, view, m: month.slice(0, 7), ...overrides };
    const query = Object.entries(merged).filter((entry): entry is [string, string] => Boolean(entry[1]));
    return `/dashboard/expenses?${new URLSearchParams(query).toString()}`;
  }

  const onDay = (day: string) => expenses.filter((expense) => expense.expense_date === day);
  const toggle = (on: boolean) =>
    cn("whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5", on ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground">Despesas fixas, pontuais e de funcionários.</p>
        </div>
        {tab === "entries" ? <NewExpenseButton options={options} defaultDate={selected ?? defaultDate} /> : null}
        {tab === "recurring" ? <NewTemplateButton options={options} defaultStart={`${today.slice(0, 7)}-01`} /> : null}
        {tab === "categories" ? <CategoryFormButton /> : null}
        {tab === "suppliers" ? <SupplierFormButton /> : null}
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Seção de gastos">
        <Link scroll={false} href={href({ tab: "entries" })} className={toggle(tab === "entries")}>
          Lançamentos
        </Link>
        <Link scroll={false} href={href({ tab: "recurring" })} className={toggle(tab === "recurring")}>
          Recorrentes
        </Link>
        <Link scroll={false} href={href({ tab: "categories" })} className={toggle(tab === "categories")}>
          Categorias
        </Link>
        <Link scroll={false} href={href({ tab: "suppliers" })} className={toggle(tab === "suppliers")}>
          Fornecedores
        </Link>
      </nav>

      {tab === "entries" ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-xs ring-1 ring-foreground/8 sm:w-fit">
            <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={href({ m: addMonths(month, -1).slice(0, 7) })} aria-label="Mês anterior" />} nativeButton={false}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
            <Button variant="outline" size="icon-sm" render={<Link scroll={false} href={href({ m: addMonths(month, 1).slice(0, 7) })} aria-label="Próximo mês" />} nativeButton={false}>
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-destructive/8 px-4 py-3">
            <span className="text-sm font-medium">Total do mês</span>
            <strong className="text-xl font-semibold tabular-nums">{formatCents(total)}</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link scroll={false} href={href({ view: "calendar" })} className={toggle(view === "calendar")}>
              Calendário
            </Link>
            <Link scroll={false} href={href({ view: "list" })} className={toggle(view === "list")}>
              Lista
            </Link>
            {isFutureMonth ? (
              <span className="text-xs text-muted-foreground">Meses futuros ainda não geram lançamentos.</span>
            ) : (
              <ActionButton action={generateMonthExpensesAction} fields={{ month }}>
                <Repeat className="size-4" /> Gerar recorrentes do mês
              </ActionButton>
            )}
          </div>

          {expenses.length === 0 ? (
            <EmptyState icon={Wallet} title="Nenhum gasto neste mês" description="Lance um gasto ou cadastre recorrências para gerar os fixos automaticamente." />
          ) : view === "list" ? (
            <Card>
              <CardContent>
                <ExpenseList items={expenses} options={options} />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="py-0">
                <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="py-2">
                      {label}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthGrid(month).map((day) => {
                    const list = onDay(day);
                    const sum = list.reduce((acc, expense) => acc + expense.amount_cents, 0);
                    const outside = day.slice(0, 7) !== month.slice(0, 7);
                    return (
                      <Link
                        key={day}
                        scroll={false} href={href({ d: day, m: day.slice(0, 7) })}
                        aria-label={`${formatLongDay(day)}, ${list.length} gasto(s)`}
                        aria-current={day === selected ? "date" : undefined}
                        className={cn(
                          "flex min-h-14 min-w-0 flex-col gap-0.5 border-r border-b p-1 text-xs hover:bg-muted/60 lg:min-h-20 lg:p-1.5 [&:nth-child(7n)]:border-r-0",
                          outside && "text-muted-foreground/50",
                          day === selected && "bg-primary/10",
                        )}
                      >
                        <span className="w-fit rounded-full px-1 tabular-nums">{Number(day.slice(8))}</span>
                        {list.length > 0 ? (
                          <>
                            <span className="hidden font-medium tabular-nums lg:block">{formatCents(sum)}</span>
                            <span className="hidden text-muted-foreground lg:block">{list.length === 1 ? "1 gasto" : `${list.length} gastos`}</span>
                            <span className="w-fit rounded-full bg-destructive/15 px-1.5 font-medium text-destructive tabular-nums lg:hidden">{list.length}</span>
                          </>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </Card>
              {selected ? (
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <h3 className="font-medium first-letter:uppercase">{formatLongDay(selected)}</h3>
                    {onDay(selected).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum gasto neste dia.</p>
                    ) : (
                      <ExpenseList items={onDay(selected)} options={options} />
                    )}
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">Toque em um dia para ver os gastos dele.</p>
              )}
            </>
          )}
        </>
      ) : null}

      {tab === "recurring" ? (
        templates.length === 0 ? (
          <EmptyState icon={Repeat} title="Nenhuma recorrência" description="Cadastre aluguel, salários e outros fixos. Um lançamento é gerado por mês, sozinho." />
        ) : (
          <Card>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {templates.map((template) => {
                  const employee = employees.find((person) => person.id === template.employee_id);
                  return (
                    <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {template.description}
                          {template.active ? null : <Badge variant="outline">Inativa</Badge>}
                          {employee ? <Badge variant="secondary">Folha</Badge> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Todo dia {template.day_of_month} · {template.category_name}
                          {employee ? ` · ${employee.name}` : ""} · desde {formatDate(template.starts_on)}
                          {template.ends_on ? ` até ${formatDate(template.ends_on)}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{formatCents(template.amount_cents)}</span>
                        <div className="flex">
                          <EditTemplateButton template={template} options={options} />
                          <DeleteTemplateButton template={template} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )
      ) : null}

      {tab === "categories" ? (
        categories.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhuma categoria" />
        ) : (
          <Card>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {categories.map((category) => (
                  <li key={category.id} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="flex flex-wrap items-center gap-2">
                      {category.name}
                      {category.system_key ? <Badge variant="outline">Usada pelo sistema</Badge> : null}
                    </span>
                    <div className="flex">
                      <CategoryFormButton category={category} />
                      {category.system_key ? null : <DeleteCategoryButton category={category} />}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      ) : null}
      {tab === "suppliers" && supplierStats ? (
        <SupplierPanel
          stats={supplierStats.stats}
          byCategory={supplierStats.byCategory}
          period={period}
          periodHref={(value) => href({ tab: "suppliers", p: value })}
        />
      ) : null}
    </div>
  );
}
