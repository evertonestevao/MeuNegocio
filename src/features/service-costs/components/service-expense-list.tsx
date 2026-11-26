"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DeleteExpenseButton, EditExpenseButton, type ExpenseFormOptions } from "@/features/expenses/components/expense-forms";
import { PAYMENT_METHOD_LABEL } from "@/features/expenses/schemas";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExpenseGroup } from "@/services/expenseService";
import type { Expense } from "@/types/finance";
import { useExpenseListMode, type ExpenseListMode } from "../hooks/use-expense-list-mode";

const MODES: { value: ExpenseListMode; label: string }[] = [
  { value: "category", label: "Por categoria" },
  { value: "date", label: "Por data" },
];

/** Gastos lançados no serviço: agrupados por categoria (como o resumo) ou todos por data. */
export function ServiceExpenseList({
  expenses,
  groups,
  options,
}: {
  expenses: Expense[];
  groups: ExpenseGroup<Expense>[];
  options: ExpenseFormOptions;
}) {
  const { mode, choose } = useExpenseListMode();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Organizar gastos">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={mode === item.value}
            onClick={() => choose(item.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-2 text-sm lg:py-1.5",
              mode === item.value ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "date" ? (
        <ExpenseRows expenses={expenses} options={options} showCategory />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <ExpenseGroupSection key={group.categoryId} group={group} options={options} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Um grupo da lista: a faixa com nome, quantidade e subtotal abre e fecha os gastos de baixo. */
function ExpenseGroupSection({ group, options }: { group: ExpenseGroup<Expense>; options: ExpenseFormOptions }) {
  const [open, setOpen] = useState(true);
  const listId = `gastos-${group.categoryId}`;

  return (
    <section className="flex flex-col gap-3" aria-label={group.name}>
      {/* -mx-3 com pl-2 (+ borda de 4px): o texto da faixa começa alinhado com o texto dos gastos. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="-mx-3 flex items-center justify-between gap-3 rounded-lg border-l-4 border-primary bg-primary/10 py-2 pr-3 pl-2 text-left hover:bg-primary/15"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">{group.name}</span>
          <span className="text-xs text-muted-foreground">
            {group.expenses.length} {group.expenses.length === 1 ? "gasto" : "gastos"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-bold text-primary tabular-nums">{formatCents(group.totalCents)}</span>
          <ChevronDown className={cn("size-4 text-primary transition-transform", open ? "rotate-180" : "")} aria-hidden />
          <span className="sr-only">{open ? "Recolher" : "Mostrar"} gastos de {group.name}</span>
        </span>
      </button>
      {open ? (
        <div id={listId}>
          <ExpenseRows expenses={group.expenses} options={options} showCategory={false} />
        </div>
      ) : null}
    </section>
  );
}

function ExpenseRows({ expenses, options, showCategory }: { expenses: Expense[]; options: ExpenseFormOptions; showCategory: boolean }) {
  return (
    <ul className="flex flex-col divide-y text-sm">
      {expenses.map((expense) => (
        <li key={expense.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium break-words">{expense.description}</span>
            <span className="text-xs text-muted-foreground">
              {[
                formatDate(expense.expense_date),
                showCategory ? expense.category_name : null,
                expense.supplier,
                expense.payment_method ? PAYMENT_METHOD_LABEL[expense.payment_method] : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-semibold tabular-nums">{formatCents(expense.amount_cents)}</span>
            <EditExpenseButton expense={expense} options={options} />
            <DeleteExpenseButton expense={expense} />
          </span>
        </li>
      ))}
    </ul>
  );
}
