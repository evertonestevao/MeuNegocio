"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { InfoHint } from "@/components/info-hint";
import { Button } from "@/components/ui/button";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_LABEL, categoryNameSchema, parseExpenseForm, parseExpenseTemplateForm, parseSupplierForm } from "@/features/expenses/schemas";
import { SupplierCombobox, type SupplierOption } from "./supplier-combobox";
import { addDays, formatDate } from "@/lib/dates";
import { centsToMoneyInput, formatCents, parseMoneyToCents } from "@/lib/money";
import { MAX_INSTALLMENTS, buildPayableInstallments, currentPayablePlan, installmentsLocked, payableStatus, type PayableMode } from "@/lib/payables";
import {
  deleteExpenseAction,
  deleteExpenseCategoryAction,
  deleteExpenseTemplateAction,
  deleteSupplierAction,
  saveExpenseAction,
  saveExpenseCategoryAction,
  saveExpenseTemplateAction,
  saveSupplierAction,
} from "@/server/actions/expenses";
import type { Expense, ExpenseCategory, ExpenseTemplate, Supplier } from "@/types/finance";

const SELECT_CLASS =
  "border-input h-11 md:h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface ExpenseQuoteOption {
  id: string;
  number: number;
  title: string | null;
  client_name: string | null;
}

export interface ExpenseFormOptions {
  categories: ExpenseCategory[];
  employees: { id: string; name: string; active: boolean }[];
  /** Orçamentos aprovados ou fechados que podem receber o gasto. */
  quotes?: ExpenseQuoteOption[];
  suppliers?: SupplierOption[];
  /** Hoje no fuso da empresa: o pagamento não pode ser depois dele. */
  today: string;
}

function Field({ id, label, hint, info, children }: { id: string; label: string; hint?: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {info ? <InfoHint text={info} /> : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CategorySelect({ id, value, options }: { id: string; value?: string; options: ExpenseFormOptions }) {
  return (
    <select id={id} name="categoryId" defaultValue={value ?? ""} className={SELECT_CLASS}>
      <option value="">Escolha a categoria</option>
      {options.categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}

function EmployeeSelect({ id, value, options }: { id: string; value?: string | null; options: ExpenseFormOptions }) {
  return (
    <select id={id} name="employeeId" defaultValue={value ?? ""} className={SELECT_CLASS}>
      <option value="">Não é de funcionário</option>
      {options.employees
        .filter((employee) => employee.active || employee.id === value)
        .map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
            {employee.active ? "" : " (inativo)"}
          </option>
        ))}
    </select>
  );
}

const CHOICE =
  "flex flex-1 items-center justify-center rounded-full px-3 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:py-1.5";

/**
 * Como o gasto vai ser pago: já pago (numa data) ou a pagar, de uma vez ou em parcelas mensais. A
 * prévia mostra cada parcela com o vencimento, para a pessoa conferir antes de salvar.
 */
function PaymentFields({ prefix, expense, amountCents, expenseDate, method, today }: {
  prefix: string;
  expense?: Expense;
  amountCents: number | null;
  expenseDate: string;
  method: string;
  today: string;
}) {
  const current = expense?.installments ?? [];
  // Gasto já salvo começa como está. Gasto novo acompanha a data do gasto até a pessoa mexer aqui:
  // data passada ou hoje, já pago nela; data futura, a pagar nela.
  const saved = current.length > 0 ? currentPayablePlan(current, expenseDate, today) : null;
  const [modeChoice, setMode] = useState<PayableMode | null>(saved?.mode ?? null);
  const [count, setCount] = useState(String(saved?.count ?? 1));
  const [paidChoice, setPaidOn] = useState<string | null>(saved?.mode === "paid" ? saved.paidOn : null);
  const [dueChoice, setFirstDue] = useState<string | null>(saved?.mode === "pending" ? saved.firstDueDate : null);
  const mode: PayableMode = modeChoice ?? (expenseDate > today ? "pending" : "paid");
  const paidOn = paidChoice ?? (expenseDate <= today ? expenseDate : today);
  const firstDue = dueChoice ?? (expenseDate > today ? expenseDate : addDays(today, 30));

  // Parcela já paga num gasto parcelado: valor e parcelas ficam como estão.
  if (installmentsLocked(current)) {
    return (
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Pagamento</legend>
        <input type="hidden" name="paymentMode" value="keep" />
        <ul className="flex flex-col divide-y text-sm">
          {current.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                {item.number}ª · vence {formatDate(item.due_date)}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{formatCents(item.amount_cents)}</span>
                <span className={`text-xs font-medium ${item.paid_on ? "text-success" : "text-muted-foreground"}`}>{item.paid_on ? "Paga" : "A pagar"}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Há parcela paga, então o valor e as parcelas não mudam por aqui. Para mudar, desfaça o pagamento na aba “A pagar”, em “Pagas”.
        </p>
      </fieldset>
    );
  }

  const parsedCount = Number(count);
  const validCount = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= MAX_INSTALLMENTS;
  const preview =
    mode === "pending" && amountCents && amountCents > 0 && validCount && firstDue
      ? buildPayableInstallments(amountCents, { mode: "pending", paidOn: "", count: parsedCount, firstDueDate: firstDue })
      : [];

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <legend className="flex items-center gap-1 px-1 text-sm font-medium">
        Pagamento
        <InfoHint text="A data do gasto é quando a compra aconteceu: ela conta no resultado do mês. Aqui você diz quando o dinheiro sai: já pago, ou a pagar de uma vez ou em parcelas." />
      </legend>
      <input type="hidden" name="paymentMode" value={mode} />
      <div role="radiogroup" aria-label="Situação do pagamento" className="flex gap-2">
        {(
          [
            ["paid", "Já paguei"],
            ["pending", "Vou pagar depois"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`${CHOICE} ${mode === value ? "bg-primary font-medium text-primary-foreground" : "border bg-card hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "paid" ? (
        <Field id={`${prefix}-paid-on`} label="Pago em" hint="Se pagou em outro dia que o da compra, mude aqui.">
          <Input id={`${prefix}-paid-on`} name="paidOn" type="date" max={today} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Field
              id={`${prefix}-count`}
              label="Parcelas"
              info="1 é pagar de uma vez. Com mais, o valor se divide em parcelas mensais, no mesmo dia de cada mês. Os centavos que sobram vão na 1ª."
            >
              <Input
                id={`${prefix}-count`}
                name="installmentsCount"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_INSTALLMENTS}
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </Field>
            <Field
              id={`${prefix}-first-due`}
              label={parsedCount > 1 ? "Vencimento da 1ª" : "Vencimento"}
              info="No cartão de crédito, use o vencimento da fatura em que a compra cai."
            >
              <Input id={`${prefix}-first-due`} name="firstDueDate" type="date" value={firstDue} onChange={(event) => setFirstDue(event.target.value)} />
            </Field>
          </div>
          {method === "credit" ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs">
              Compra no cartão: a data do gasto é o dia da compra, e o vencimento é o da fatura. Se parcelou no cartão, informe as parcelas da fatura.
            </p>
          ) : null}
          {preview.length > 1 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Parcelas que vão ficar a pagar</p>
              <ul className="flex max-h-40 flex-col divide-y overflow-y-auto rounded-lg border px-3 text-sm">
                {preview.map((item, index) => (
                  <li key={item.due_date} className="flex items-center justify-between gap-3 py-1.5">
                    <span>
                      {index + 1}ª · {formatDate(item.due_date)}
                    </span>
                    <span className="tabular-nums">{formatCents(item.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : preview.length === 1 ? (
            <p className="text-xs text-muted-foreground">
              Fica a pagar {formatCents(preview[0].amount_cents)} em {formatDate(preview[0].due_date)}. Na aba “A pagar”, é só dar baixa quando pagar.
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}

/** Situação de uma parcela, no texto curto da lista. */
export function installmentStatusText(item: { paid_on: string | null; due_date: string }, today: string): string {
  const status = payableStatus(item, today);
  if (status === "paid") return `Paga em ${formatDate(item.paid_on)}`;
  if (status === "overdue") return `Venceu em ${formatDate(item.due_date)}`;
  if (status === "due_today") return "Vence hoje";
  return `Vence em ${formatDate(item.due_date)}`;
}

function ExpenseFields({ expense, options, defaultDate, defaultQuoteId }: { expense?: Expense; options: ExpenseFormOptions; defaultDate: string; defaultQuoteId?: string }) {
  const prefix = expense?.id ?? "new-expense";
  // Só o gasto pontual entra no custo de um serviço: recorrências e folha são da empresa toda.
  const canLinkQuote = !expense || expense.kind === "one_off";
  const lockedQuote = !expense && defaultQuoteId ? options.quotes?.find((quote) => quote.id === defaultQuoteId) : undefined;
  const [amount, setAmount] = useState(expense ? centsToMoneyInput(expense.amount_cents) : "");
  const [method, setMethod] = useState<string>(expense?.payment_method ?? "");
  const [date, setDate] = useState(expense?.expense_date ?? defaultDate);
  const locked = installmentsLocked(expense?.installments ?? []);
  return (
    <>
      {expense ? <input type="hidden" name="expenseId" value={expense.id} /> : null}
      {expense?.template_id ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs">Este lançamento foi gerado por uma recorrência mensal. Editar aqui muda só este mês.</p>
      ) : null}
      <Field id={`${prefix}-description`} label="Descrição">
        <Input id={`${prefix}-description`} name="description" defaultValue={expense?.description ?? ""} placeholder="Ex.: Cabos e disjuntores" />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Field id={`${prefix}-amount`} label="Valor total" info={locked ? "Há parcela paga: o valor só muda depois de desfazer o pagamento." : "O valor da compra inteira. Se for parcelar, as parcelas são calculadas logo abaixo."}>
          <MaskedInput mask="money" id={`${prefix}-amount`} name="amount" value={amount} readOnly={locked} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field id={`${prefix}-date`} label="Data do gasto" info="Quando a compra ou a despesa aconteceu. É essa data que conta no resultado do mês e no custo do serviço, mesmo que o pagamento seja depois.">
          <Input id={`${prefix}-date`} name="expenseDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-category`} label="Categoria">
          <CategorySelect id={`${prefix}-category`} value={expense?.category_id} options={options} />
        </Field>
        <Field id={`${prefix}-supplier`} label="Fornecedor">
          <SupplierCombobox
            id={`${prefix}-supplier`}
            suppliers={options.suppliers ?? []}
            initial={expense?.supplier_id ? { id: expense.supplier_id, name: expense.supplier ?? "" } : null}
          />
        </Field>
      </div>
      <Field id={`${prefix}-payment`} label="Forma de pagamento">
        <select id={`${prefix}-payment`} name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)} className={SELECT_CLASS}>
          <option value="">Não informada</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <PaymentFields prefix={prefix} expense={expense} amountCents={parseMoneyToCents(amount)} expenseDate={date} method={method} today={options.today} />
      {canLinkQuote && options.quotes ? (
        lockedQuote ? (
          // Lançado de dentro do serviço: já vai para ele, sem um seletor a mais na tela.
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            <input type="hidden" name="quoteId" value={lockedQuote.id} />
            Serviço: <strong>#{String(lockedQuote.number).padStart(4, "0")} · {lockedQuote.title ?? "Sem título"}</strong>
          </p>
        ) : (
          <Field id={`${prefix}-quote`} label="Serviço (orçamento)" hint="Opcional. Entra no custo e no resultado desse serviço.">
            <select id={`${prefix}-quote`} name="quoteId" defaultValue={expense?.quote_id ?? ""} className={SELECT_CLASS}>
              <option value="">Nenhum, gasto geral</option>
              {options.quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  #{String(quote.number).padStart(4, "0")} · {quote.title ?? "Sem título"}
                  {quote.client_name ? ` · ${quote.client_name}` : ""}
                </option>
              ))}
            </select>
          </Field>
        )
      ) : null}
      {lockedQuote ? null : (
        <Field id={`${prefix}-employee`} label="Funcionário">
          <EmployeeSelect id={`${prefix}-employee`} value={expense?.employee_id} options={options} />
        </Field>
      )}
      <Field id={`${prefix}-notes`} label="Observações">
        <Input id={`${prefix}-notes`} name="notes" defaultValue={expense?.notes ?? ""} />
      </Field>
    </>
  );
}

export function NewExpenseButton({
  options,
  defaultDate,
  defaultQuoteId,
  label = "Novo gasto",
  variant = "default",
}: {
  options: ExpenseFormOptions;
  defaultDate: string;
  defaultQuoteId?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <DialogForm
      title="Novo gasto"
      action={saveExpenseAction}
      validate={parseExpenseForm}
      submitLabel="Salvar gasto"
      trigger={(open) => (
        <Button variant={variant} onClick={open}>
          <Plus className="size-4" /> {label}
        </Button>
      )}
    >
      <ExpenseFields options={options} defaultDate={defaultDate} defaultQuoteId={defaultQuoteId} />
    </DialogForm>
  );
}

export function EditExpenseButton({ expense, options }: { expense: Expense; options: ExpenseFormOptions }) {
  return (
    <DialogForm
      title="Editar gasto"
      action={saveExpenseAction}
      validate={parseExpenseForm}
      submitLabel="Salvar gasto"
      trigger={(open) => (
        <Button variant="edit" size="icon-sm" aria-label={`Editar ${expense.description}`} onClick={open}>
          <Pencil className="size-4" />
        </Button>
      )}
    >
      <ExpenseFields expense={expense} options={options} defaultDate={expense.expense_date} />
    </DialogForm>
  );
}

export function DeleteExpenseButton({ expense }: { expense: Expense }) {
  const reopens = expense.kind === "contractor";
  return (
    <DialogForm
      title="Excluir gasto"
      description={`Excluir o gasto “${expense.description}”?${reopens ? " As horas pagas voltam para “aprovado” e podem ser fechadas de novo." : ""}`}
      action={deleteExpenseAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="destructive" size="icon-sm" aria-label={`Excluir ${expense.description}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="expenseId" value={expense.id} />
    </DialogForm>
  );
}

function TemplateFields({ template, options, defaultStart }: { template?: ExpenseTemplate; options: ExpenseFormOptions; defaultStart: string }) {
  const prefix = template?.id ?? "new-template";
  return (
    <>
      {template ? <input type="hidden" name="templateId" value={template.id} /> : null}
      <Field id={`${prefix}-description`} label="Descrição">
        <Input id={`${prefix}-description`} name="description" defaultValue={template?.description ?? ""} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-category`} label="Categoria">
          <CategorySelect id={`${prefix}-category`} value={template?.category_id} options={options} />
        </Field>
        <Field id={`${prefix}-employee`} label="Funcionário" hint="Com funcionário, gera folha.">
          <EmployeeSelect id={`${prefix}-employee`} value={template?.employee_id} options={options} />
        </Field>
        <Field id={`${prefix}-amount`} label="Valor">
          <MaskedInput mask="money" id={`${prefix}-amount`} name="amount" defaultValue={template ? centsToMoneyInput(template.amount_cents) : ""} />
        </Field>
        <Field id={`${prefix}-day`} label="Dia do mês" hint="De 1 a 28, para existir em todo mês.">
          <Input id={`${prefix}-day`} name="dayOfMonth" inputMode="numeric" defaultValue={template?.day_of_month ?? 5} />
        </Field>
        <Field id={`${prefix}-start`} label="Início">
          <Input id={`${prefix}-start`} name="startsOn" type="date" defaultValue={template?.starts_on ?? defaultStart} />
        </Field>
        <Field id={`${prefix}-end`} label="Fim (opcional)">
          <Input id={`${prefix}-end`} name="endsOn" type="date" defaultValue={template?.ends_on ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} className="size-4" />
        Ativa
      </label>
    </>
  );
}

export function NewTemplateButton({ options, defaultStart }: { options: ExpenseFormOptions; defaultStart: string }) {
  return (
    <DialogForm
      title="Nova recorrência mensal"
      action={saveExpenseTemplateAction}
      validate={parseExpenseTemplateForm}
      submitLabel="Salvar recorrência"
      trigger={(open) => (
        <Button onClick={open}>
          <Plus className="size-4" /> Nova recorrência
        </Button>
      )}
    >
      <TemplateFields options={options} defaultStart={defaultStart} />
    </DialogForm>
  );
}

export function EditTemplateButton({ template, options }: { template: ExpenseTemplate; options: ExpenseFormOptions }) {
  return (
    <DialogForm
      title="Editar recorrência"
      description="Vale para os próximos meses. O que já foi lançado não muda."
      action={saveExpenseTemplateAction}
      validate={parseExpenseTemplateForm}
      submitLabel="Salvar recorrência"
      trigger={(open) => (
        <Button variant="edit" size="icon-sm" aria-label={`Editar ${template.description}`} onClick={open}>
          <Pencil className="size-4" />
        </Button>
      )}
    >
      <TemplateFields template={template} options={options} defaultStart={template.starts_on} />
    </DialogForm>
  );
}

export function DeleteTemplateButton({ template }: { template: ExpenseTemplate }) {
  return (
    <DialogForm
      title="Excluir recorrência"
      description={`Excluir “${template.description}”? O que já foi lançado continua.`}
      action={deleteExpenseTemplateAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="destructive" size="icon-sm" aria-label={`Excluir ${template.description}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="templateId" value={template.id} />
    </DialogForm>
  );
}

function validateCategory(formData: FormData) {
  return categoryNameSchema.parse(formData.get("name") ?? "");
}

export function CategoryFormButton({ category }: { category?: ExpenseCategory }) {
  const id = `${category?.id ?? "new-category"}-name`;
  return (
    <DialogForm
      title={category ? "Renomear categoria" : "Nova categoria"}
      action={saveExpenseCategoryAction}
      validate={validateCategory}
      submitLabel="Salvar"
      trigger={(open) =>
        category ? (
          <Button variant="edit" size="icon-sm" aria-label={`Renomear ${category.name}`} onClick={open}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button onClick={open}>
            <Plus className="size-4" /> Nova categoria
          </Button>
        )
      }
    >
      {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
      <Field id={id} label="Nome">
        <Input id={id} name="name" defaultValue={category?.name ?? ""} autoFocus />
      </Field>
    </DialogForm>
  );
}

export function DeleteCategoryButton({ category }: { category: ExpenseCategory }) {
  return (
    <DialogForm
      title="Excluir categoria"
      description={`Excluir ${category.name}? Categoria em uso não pode ser excluída.`}
      action={deleteExpenseCategoryAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="destructive" size="icon-sm" aria-label={`Excluir ${category.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="categoryId" value={category.id} />
    </DialogForm>
  );
}

export function SupplierFormButton({ supplier }: { supplier?: Supplier }) {
  const prefix = supplier?.id ?? "new-supplier";
  return (
    <DialogForm
      title={supplier ? "Editar fornecedor" : "Novo fornecedor"}
      action={saveSupplierAction}
      validate={parseSupplierForm}
      submitLabel="Salvar fornecedor"
      trigger={(open) =>
        supplier ? (
          <Button variant="edit" size="icon-sm" aria-label={`Editar ${supplier.name}`} onClick={open}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button onClick={open}>
            <Plus className="size-4" /> Novo fornecedor
          </Button>
        )
      }
    >
      {supplier ? <input type="hidden" name="supplierId" value={supplier.id} /> : null}
      <Field id={`${prefix}-name`} label="Nome">
        <Input id={`${prefix}-name`} name="name" defaultValue={supplier?.name ?? ""} placeholder="Ex.: Casa do Eletricista" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-document`} label="CNPJ ou CPF">
          <MaskedInput mask="cpfCnpj" id={`${prefix}-document`} name="document" defaultValue={supplier?.document ?? ""} placeholder="Opcional" />
        </Field>
        <Field id={`${prefix}-phone`} label="Telefone">
          <MaskedInput mask="phone" id={`${prefix}-phone`} name="phone" defaultValue={supplier?.phone ?? ""} placeholder="Opcional" />
        </Field>
      </div>
      <Field id={`${prefix}-notes`} label="Observações" hint="Ex.: vendedor, prazo de entrega, condições.">
        <Input id={`${prefix}-notes`} name="notes" defaultValue={supplier?.notes ?? ""} />
      </Field>
    </DialogForm>
  );
}

export function DeleteSupplierButton({ supplier }: { supplier: Supplier }) {
  return (
    <DialogForm
      title="Excluir fornecedor"
      description={`Excluir ${supplier.name}? Os gastos já lançados continuam com o nome dele.`}
      action={deleteSupplierAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="destructive" size="icon-sm" aria-label={`Excluir ${supplier.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="supplierId" value={supplier.id} />
    </DialogForm>
  );
}
