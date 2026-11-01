"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { MaskedInput } from "@/components/masked-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACT_LABEL, parseEmployeeForm } from "@/features/team/schemas";
import { centsToMoneyInput } from "@/lib/money";
import { deleteEmployeeAction, saveEmployeeAction } from "@/server/actions/team";
import type { EmployeeListItem } from "@/types/database";

const SELECT_CLASS =
  "border-input h-11 md:h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface LinkableUser {
  id: string;
  name: string;
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

function EmployeeFields({ employee, users }: { employee?: EmployeeListItem; users: LinkableUser[] }) {
  const prefix = employee?.id ?? "new-employee";
  const details = employee?.details;
  return (
    <div className="flex max-h-[60svh] flex-col gap-4 overflow-y-auto pr-1">
      {employee ? <input type="hidden" name="employeeId" value={employee.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-name`} label="Nome">
          <Input id={`${prefix}-name`} name="name" defaultValue={employee?.name ?? ""} autoFocus />
        </Field>
        <Field id={`${prefix}-job`} label="Função">
          <Input id={`${prefix}-job`} name="jobTitle" defaultValue={employee?.job_title ?? ""} />
        </Field>
        <Field id={`${prefix}-phone`} label="Telefone">
          <MaskedInput mask="phone" id={`${prefix}-phone`} name="phone" defaultValue={details?.phone ?? ""} />
        </Field>
        <Field id={`${prefix}-contract`} label="Contrato">
          <select id={`${prefix}-contract`} name="contractType" defaultValue={details?.contract_type ?? "clt"} className={SELECT_CLASS}>
            {Object.entries(CONTRACT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${prefix}-cost`} label="Custo por hora" hint="Para CLT: salário e encargos divididos pelas horas do mês.">
          <MaskedInput mask="money" id={`${prefix}-cost`} name="hourlyCost" defaultValue={details ? centsToMoneyInput(details.hourly_cost_cents) : ""} />
        </Field>
        <Field id={`${prefix}-pay`} label="Valor pago por hora" hint="Para prestadores PJ e autônomos.">
          <MaskedInput mask="money" id={`${prefix}-pay`} name="hourlyPay" defaultValue={details ? centsToMoneyInput(details.hourly_pay_cents) : ""} />
        </Field>
        <Field id={`${prefix}-legal`} label="Razão social">
          <Input id={`${prefix}-legal`} name="legalName" defaultValue={details?.legal_name ?? ""} />
        </Field>
        <Field id={`${prefix}-tax`} label="CPF ou CNPJ">
          <MaskedInput mask="cpfCnpj" id={`${prefix}-tax`} name="taxId" defaultValue={details?.tax_id ?? ""} />
        </Field>
        <Field id={`${prefix}-pix`} label="Pix">
          <Input id={`${prefix}-pix`} name="pixKey" defaultValue={details?.pix_key ?? ""} />
        </Field>
        <Field id={`${prefix}-user`} label="Usuário vinculado" hint="Opcional. É o que dá ao técnico acesso às próprias visitas.">
          <select id={`${prefix}-user`} name="userId" defaultValue={employee?.user_id ?? ""} className={SELECT_CLASS}>
            <option value="">Sem acesso</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={employee?.active ?? true} className="size-4" />
        Ativo (pode ser escalado em visitas)
      </label>
      <p className="rounded-lg bg-muted px-3 py-2 text-xs">
        Para prestadores, registre horas por serviço realizado. Evite exigir jornada fixa ou controle de ponto: isso pode
        caracterizar vínculo de emprego.
      </p>
    </div>
  );
}

export function NewEmployeeButton({ users }: { users: LinkableUser[] }) {
  return (
    <DialogForm
      title="Nova pessoa"
      action={saveEmployeeAction}
      validate={parseEmployeeForm}
      submitLabel="Salvar"
      trigger={(open) => (
        <Button onClick={open}>
          <Plus className="size-4" /> Nova pessoa
        </Button>
      )}
    >
      <EmployeeFields users={users} />
    </DialogForm>
  );
}

export function EditEmployeeButton({ employee, users }: { employee: EmployeeListItem; users: LinkableUser[] }) {
  return (
    <DialogForm
      title={`Editar ${employee.name}`}
      action={saveEmployeeAction}
      validate={parseEmployeeForm}
      submitLabel="Salvar"
      trigger={(open) => (
        <Button variant="edit" size="icon-sm" aria-label={`Editar ${employee.name}`} onClick={open}>
          <Pencil className="size-4" />
        </Button>
      )}
    >
      <EmployeeFields employee={employee} users={users} />
    </DialogForm>
  );
}

export function DeleteEmployeeButton({ employee }: { employee: EmployeeListItem }) {
  return (
    <DialogForm
      title="Excluir cadastro"
      description={`Excluir ${employee.name}? Quem aparece em visitas não pode ser excluído, só desativado.`}
      action={deleteEmployeeAction}
      submitLabel="Excluir"
      variant="destructive"
      trigger={(open) => (
        <Button variant="destructive" size="icon-sm" aria-label={`Excluir ${employee.name}`} onClick={open}>
          <Trash2 className="size-4" />
        </Button>
      )}
    >
      <input type="hidden" name="employeeId" value={employee.id} />
    </DialogForm>
  );
}
