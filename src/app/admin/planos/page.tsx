import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { PLAN_FEATURES, describePlanFeature } from "@/config/planFeatures";
import { PlanActiveButton } from "@/features/plans/components/plan-active-button";
import { PlanForm } from "@/features/plans/components/plan-form";
import { formatCents } from "@/lib/money";
import { createPlanAction, updatePlanAction } from "@/server/actions/plans";
import { getPlanAdminService, getPlatformAdminId } from "@/server/plans";
import type { PlanAuditEntry } from "@/types/database";

export const metadata: Metadata = { title: "Planos" };

const ACTION_LABEL: Record<PlanAuditEntry["action"], string> = {
  created: "Criou",
  updated: "Alterou",
  activated: "Ativou",
  deactivated: "Desativou",
};

const WATCHED_FIELDS: { key: string; label: string; money?: boolean }[] = [
  { key: "name", label: "Nome" },
  { key: "price_cents", label: "Preço", money: true },
  { key: "extra_seat_price_cents", label: "Membro extra", money: true },
];

function display(value: unknown, money?: boolean): string {
  return money && typeof value === "number" ? formatCents(value) : String(value);
}

/** O que mudou de um valor para outro, em texto: "Preço: R$ 1,00 → R$ 2,00". */
function describeChanges(entry: PlanAuditEntry): string[] {
  const before = entry.old_values;
  if (!before) return [];
  const after = entry.new_values;
  const fields = WATCHED_FIELDS.filter((field) => before[field.key] !== after[field.key]).map(
    (field) => `${field.label}: ${display(before[field.key], field.money)} → ${display(after[field.key], field.money)}`,
  );
  const oldFeatures = (before.features ?? {}) as Record<string, unknown>;
  const newFeatures = (after.features ?? {}) as Record<string, unknown>;
  const features = PLAN_FEATURES.filter((feature) => oldFeatures[feature.key] !== newFeatures[feature.key]).map(
    (feature) => `${describePlanFeature(feature, oldFeatures[feature.key])} → ${describePlanFeature(feature, newFeatures[feature.key]).split(": ")[1]}`,
  );
  return [...fields, ...features];
}

export default async function PlansPage() {
  if (!(await getPlatformAdminId())) redirect("/dashboard");

  const service = getPlanAdminService();
  const [plans, audit] = await Promise.all([service.list(), service.listAudit()]);
  const planNames = new Map(plans.map((plan) => [plan.id, plan.name]));
  const usesPriceCatalog = getServerEnv().PAYMENT_GATEWAY === "stripe";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Planos</h2>
        <p className="text-sm text-muted-foreground">
          Limites e recursos valem na hora para as empresas do plano. Desativar tira o plano da oferta, e quem já
          assina continua nele.
        </p>
      </div>

      {usesPriceCatalog ? (
        <Alert>
          <AlertDescription>
            O Stripe cobra pelo catálogo de preços dele, não por este painel. Ao alterar um preço aqui, altere também
            no Stripe e em PAYMENT_PRICE_*.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  {plan.name}
                  {plan.is_active ? null : <Badge variant="secondary">Inativo</Badge>}
                </CardTitle>
                <PlanActiveButton planId={plan.id} isActive={plan.is_active} />
              </div>
              <CardDescription>
                Código {plan.code} · {formatCents(plan.price_cents, plan.currency)} por mês
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanForm plan={plan} action={updatePlanAction} submitLabel="Salvar plano" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo plano</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanForm action={createPlanAction} submitLabel="Criar plano" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de alterações</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
                  <p>
                    <span className="font-medium">{entry.changed_by_name ?? "Usuário removido"}</span>{" "}
                    {ACTION_LABEL[entry.action].toLowerCase()} {planNames.get(entry.plan_id) ?? "o plano"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {new Date(entry.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </p>
                  {describeChanges(entry).map((change) => (
                    <p key={change} className="text-muted-foreground">
                      {change}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
