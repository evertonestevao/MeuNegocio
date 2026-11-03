"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_LABEL, categoryNameSchema, parseExpenseForm, parseExpenseTemplateForm, parseSupplierForm } from "@/features/expenses/schemas";
import { SupplierCombobox, type SupplierOption } from "./supplier-combobox";
import { centsToMoneyInput } from "@/lib/money";
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
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
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

function ExpenseFields({ expense, options, defaultDate, defaultQuoteId }: { expense?: Expense; options: ExpenseFormOptions; defaultDate: string; defaultQuoteId?: string }) {
  const prefix = expense?.id ?? "new-expense";
  // Só o gasto pontual entra no custo de um serviço: recorrências e folha são da empresa toda.
  const canLinkQuote = !expense || expense.kind === "one_off";
  const lockedQuote = !expense && defaultQuoteId ? options.quotes?.find((quote) => quote.id === defaultQuoteId) : undefined;
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
        <Field id={`${prefix}-amount`} label="Valor">
          <MaskedInput mask="money" id={`${prefix}-amount`} name="amount" defaultValue={expense ? centsToMoneyInput(expense.amount_cents) : ""} />
        </Field>
        <Field id={`${prefix}-date`} label="Data">
          <Input id={`${prefix}-date`} name="expenseDate" type="date" defaultValue={expense?.expense_date ?? defaultDate} />
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
        <select id={`${prefix}-payment`} name="paymentMethod" defaultValue={expense?.payment_method ?? ""} className={SELECT_CLASS}>
          <option value="">Não informada</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
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
