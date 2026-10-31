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
} from "@/features/expenses/components/expense-forms";
import { EXPENSE_KIND_LABEL } from "@/features/expenses/schemas";
import { addMonths, formatLongDay, formatMonth, isValidDate, monthGrid } from "@/lib/calendar";
import { addDays, formatDate, todayInTimezone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { generateMonthExpensesAction } from "@/server/actions/expenses";
import { getExpenseService } from "@/server/finance";
import { getCompanyProfileService } from "@/server/quotes";
import { getEmployeeService } from "@/server/schedule";
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
              {formatDate(expense.expense_date)} · {expense.category_name} · {EXPENSE_KIND_LABEL[expense.kind]}
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
  searchParams: Promise<{ tab?: string; view?: string; m?: string; d?: string }>;
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
  const tab = params.tab === "recurring" || params.tab === "categories" ? params.tab : "entries";
  const view = params.view === "list" ? "list" : "calendar";

  const service = await getExpenseService();
  const [expenses, templates, categories, employees] = await Promise.all([
    service.list(actor, month, lastDay),
    service.listTemplates(actor),
    service.listCategories(actor),
    (await getEmployeeService()).list(actor, today),
  ]);
  const options = {
    categories,
    employees: employees.map(({ id, name, active: isActive }) => ({ id, name, active: isActive })),
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
    cn("rounded-lg px-3 py-1.5 text-sm", on ? "bg-primary font-medium text-primary-foreground" : "border hover:bg-muted");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Gastos</h2>
          <p className="text-sm text-muted-foreground">Despesas fixas, pontuais e de funcionários.</p>
        </div>
        {tab === "entries" ? <NewExpenseButton options={options} defaultDate={selected ?? defaultDate} /> : null}
        {tab === "recurring" ? <NewTemplateButton options={options} defaultStart={`${today.slice(0, 7)}-01`} /> : null}
        {tab === "categories" ? <CategoryFormButton /> : null}
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Seção de gastos">
        <Link href={href({ tab: "entries" })} className={toggle(tab === "entries")}>
          Lançamentos
        </Link>
        <Link href={href({ tab: "recurring" })} className={toggle(tab === "recurring")}>
          Recorrentes
        </Link>
        <Link href={href({ tab: "categories" })} className={toggle(tab === "categories")}>
          Categorias
        </Link>
      </nav>

      {tab === "entries" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon-sm" render={<Link href={href({ m: addMonths(month, -1).slice(0, 7) })} aria-label="Mês anterior" />} nativeButton={false}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
            <Button variant="outline" size="icon-sm" render={<Link href={href({ m: addMonths(month, 1).slice(0, 7) })} aria-label="Próximo mês" />} nativeButton={false}>
              <ChevronRight className="size-4" />
            </Button>
            <Link href={href({ view: "calendar" })} className={toggle(view === "calendar")}>
              Calendário
            </Link>
            <Link href={href({ view: "list" })} className={toggle(view === "list")}>
              Lista
            </Link>
            {isFutureMonth ? (
              <span className="text-xs text-muted-foreground">Meses futuros ainda não geram lançamentos.</span>
            ) : (
              <ActionButton action={generateMonthExpensesAction} fields={{ month }}>
                <Repeat className="size-4" /> Gerar recorrentes do mês
              </ActionButton>
            )}
            <span className="flex items-baseline gap-2 text-sm lg:ml-auto">
              <span className="text-muted-foreground">Total do mês</span>
              <strong className="tabular-nums">{formatCents(total)}</strong>
            </span>
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
                        href={href({ d: day, m: day.slice(0, 7) })}
                        aria-label={`${formatLongDay(day)}, ${list.length} gasto(s)`}
                        aria-current={day === selected ? "date" : undefined}
                        className={cn(
                          "flex min-h-14 min-w-0 flex-col gap-0.5 border-r border-b p-1 text-xs hover:bg-muted/60 lg:min-h-20 lg:p-1.5 [&:nth-child(7n)]:border-r-0",
                          outside && "text-muted-foreground/50",
                          day === selected && "bg-muted",
                        )}
                      >
                        <span className="w-fit rounded-full px-1 tabular-nums">{Number(day.slice(8))}</span>
                        {list.length > 0 ? (
                          <>
                            <span className="hidden font-medium tabular-nums lg:block">{formatCents(sum)}</span>
                            <span className="hidden text-muted-foreground lg:block">{list.length === 1 ? "1 gasto" : `${list.length} gastos`}</span>
                            <span className="w-fit rounded bg-secondary px-1 tabular-nums lg:hidden">{list.length}</span>
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
    </div>
  );
}
