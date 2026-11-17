"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanForm } from "@/features/plans/components/plan-form";
import type { ActionState } from "@/server/actions/action-state";

type FormAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

/**
 * Topo da tela de planos: título, o botão "Novo plano" e, ao clicar, o formulário de criação logo
 * abaixo, acima da lista. A tela abre só com os planos existentes; o formulário fecha sozinho depois
 * de criar o plano.
 */
export function PlansHeader({ createAction }: { createAction: FormAction }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Planos</h1>
          <p className="text-sm text-muted-foreground">
            Limites e recursos valem na hora para as empresas do plano. Desativar tira o plano da oferta, e quem já
            assina continua nele. Plano privado só aparece para os e-mails liberados no cartão dele.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "outline" : "default"}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          {open ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {open ? "Cancelar" : "Novo plano"}
        </Button>
      </div>

      {open ? (
        <Card id={panelId} className="border-2 border-dashed border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle>Criar um novo plano</CardTitle>
            <CardDescription>
              O plano novo já fica ativo e aparece na oferta, a menos que seja privado. Para guardá-lo sem vender,
              desative depois de criar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanForm action={createAction} submitLabel="Criar plano" onSaved={() => setOpen(false)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
