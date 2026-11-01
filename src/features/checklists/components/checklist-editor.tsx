"use client";

import { ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_ITEMS = 30;

/** Lista editável de itens, usada no modelo da empresa e no ajuste de uma visita. */
export function ChecklistEditor({
  idPrefix,
  labels,
  onChange,
}: {
  idPrefix: string;
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const replace = (index: number, value: string) => onChange(labels.map((label, position) => (position === index ? value : label)));
  const remove = (index: number) => onChange(labels.filter((_, position) => position !== index));
  const moveUp = (index: number) => {
    const next = [...labels];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {labels.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item. A ordem de serviço abre sem checklist.</p> : null}
      {labels.map((label, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            id={`${idPrefix}-${index}`}
            aria-label={`Item ${index + 1} do checklist`}
            value={label}
            maxLength={120}
            onChange={(event) => replace(index, event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} aria-label={`Subir item ${index + 1}`} onClick={() => moveUp(index)}>
            <ArrowUp className="size-4" />
          </Button>
          <Button type="button" variant="destructive" size="icon-sm" aria-label={`Remover item ${index + 1}`} onClick={() => remove(index)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" disabled={labels.length >= MAX_ITEMS} onClick={() => onChange([...labels, ""])}>
        <Plus className="size-4" /> Adicionar item
      </Button>
    </div>
  );
}
