"use client";

import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supplierSearchKey } from "../schemas";

export interface SupplierOption {
  id: string;
  name: string;
}

/**
 * Campo de fornecedor: lista os cadastrados conforme a pessoa digita. Escolher um manda o id; um
 * nome novo segue como texto e o servidor cadastra o fornecedor ao salvar o gasto.
 */
export function SupplierCombobox({ id, suppliers, initial }: { id: string; suppliers: SupplierOption[]; initial?: SupplierOption | null }) {
  const listId = useId();
  const [text, setText] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<SupplierOption | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const key = supplierSearchKey(text);
  const matches = useMemo(
    () => (key ? suppliers.filter((supplier) => supplierSearchKey(supplier.name).includes(key)) : suppliers).slice(0, 6),
    [key, suppliers],
  );
  const exact = matches.some((supplier) => supplierSearchKey(supplier.name) === key);
  const options = [...matches.map((supplier) => ({ kind: "pick" as const, supplier })), ...(key && !exact ? [{ kind: "new" as const }] : [])];

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === "pick") {
      setSelected(option.supplier);
      setText(option.supplier.name);
    } else {
      setSelected(null);
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name="supplierId" value={selected?.id ?? ""} />
      <Input
        id={id}
        name="supplierName"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={120}
        placeholder="Comece a digitar"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSelected(null);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Espera o toque na opção antes de fechar a lista.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!open || options.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, options.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(active);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && options.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
          {options.map((option, index) => (
            <li
              key={option.kind === "pick" ? option.supplier.id : "new"}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm md:min-h-9",
                index === active && "bg-muted",
              )}
            >
              {option.kind === "pick" ? (
                option.supplier.name
              ) : (
                <>
                  <Plus className="size-4 text-primary" aria-hidden /> Cadastrar “{text.trim()}”
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {!selected && key && !exact ? <p className="mt-1 text-xs text-muted-foreground">Fornecedor novo: será cadastrado ao salvar.</p> : null}
    </div>
  );
}
