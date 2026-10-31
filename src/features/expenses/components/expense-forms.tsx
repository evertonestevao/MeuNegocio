"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoryNameSchema, parseExpenseForm, parseExpenseTemplateForm } from "@/features/expenses/schemas";
import { centsToMoneyInput } from "@/lib/money";
import {
  deleteExpenseAction,
  deleteExpenseCategoryAction,
  deleteExpenseTemplateAction,
  saveExpenseAction,
  saveExpenseCategoryAction,
  saveExpenseTemplateAction,
} from "@/server/actions/expenses";
import type { Expense, ExpenseCategory, ExpenseTemplate } from "@/types/finance";

const SELECT_CLASS =
  "border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface ExpenseFormOptions {
  categories: ExpenseCategory[];
  employees: { id: string; name: string; active: boolean }[];
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

function ExpenseFields({ expense, options, defaultDate }: { expense?: Expense; options: ExpenseFormOptions; defaultDate: string }) {
  const prefix = expense?.id ?? "new-expense";
  return (
    <>
      {expense ? <input type="hidden" name="expenseId" value={expense.id} /> : null}
      {expense?.template_id ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs">Este lançamento foi gerado por uma recorrência mensal. Editar aqui muda só este mês.</p>
      ) : null}
      <Field id={`${prefix}-description`} label="Descrição">
        <Input id={`${prefix}-description`} name="description" defaultValue={expense?.description ?? ""} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-category`} label="Categoria">
          <CategorySelect id={`${prefix}-category`} value={expense?.category_id} options={options} />
        </Field>
        <Field id={`${prefix}-employee`} label="Funcionário">
          <EmployeeSelect id={`${prefix}-employee`} value={expense?.employee_id} options={options} />
        </Field>
        <Field id={`${prefix}-amount`} label="Valor">
          <MaskedInput mask="money" id={`${prefix}-amount`} name="amount" defaultValue={expense ? centsToMoneyInput(expense.amount_cents) : ""} />
        </Field>
        <Field id={`${prefix}-date`} label="Data">
          <Input id={`${prefix}-date`} name="expenseDate" type="date" defaultValue={expense?.expense_date ?? defaultDate} />
        </Field>
      </div>
      <Field id={`${prefix}-notes`} label="Observações">
        <Input id={`${prefix}-notes`} name="notes" defaultValue={expense?.notes ?? ""} />
      </Field>
    </>
  );
}

export function NewExpenseButton({ options, defaultDate, label = "Novo gasto", variant = "default" }: { options: ExpenseFormOptions; defaultDate: string; label?: string; variant?: "default" | "outline" }) {
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
      <ExpenseFields options={options} defaultDate={defaultDate} />
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
        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${expense.description}`} onClick={open}>
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
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${expense.description}`} onClick={open}>
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
        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${template.description}`} onClick={open}>
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
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${template.description}`} onClick={open}>
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
          <Button variant="ghost" size="icon-sm" aria-label={`Renomear ${category.name}`} onClick={open}>
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
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${category.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="categoryId" value={category.id} />
    </DialogForm>
  );
}
