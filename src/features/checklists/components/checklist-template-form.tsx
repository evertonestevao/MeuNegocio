"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checklistLabelsSchema } from "@/features/work-orders/schemas";
import { saveChecklistTemplateAction } from "@/server/actions/checklists";
import type { VisitKind } from "@/types/database";
import { ChecklistEditor } from "./checklist-editor";

export function ChecklistTemplateForm({
  kind,
  title,
  description,
  initialLabels,
}: {
  kind: VisitKind;
  title: string;
  description: string;
  initialLabels: string[];
}) {
  const [labels, setLabels] = useState(initialLabels);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const parsed = checklistLabelsSchema.safeParse(labels);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Checklist inválido.");
      return;
    }
    startTransition(async () => {
      const result = await saveChecklistTemplateAction(kind, parsed.data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLabels(parsed.data);
      toast.success(`Checklist de ${title.toLowerCase()} salvo`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChecklistEditor idPrefix={`template-${kind}`} labels={labels} onChange={setLabels} />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="button" disabled={pending} className="self-start" onClick={save} aria-label={`Salvar checklist de ${title.toLowerCase()}`}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
