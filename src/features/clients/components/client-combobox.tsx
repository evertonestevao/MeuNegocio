"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClientPickerOption } from "@/types/database";
import { filterClientOptions } from "@/features/clients/picker";

interface ClientComboboxProps {
  id?: string;
  clients: ClientPickerOption[];
  /** Id do cliente escolhido, ou null. */
  value: string | null;
  /** Avisa a escolha com os locais do cliente, para o editor pré-selecionar o local. */
  onSelect: (id: string | null, locationIds: string[]) => void;
  disabled?: boolean;
}

interface ListRect {
  left: number;
  top: number;
  width: number;
  /** Altura máxima da lista, limitada pelo espaço livre até a borda da tela. */
  maxHeight: number;
  /** A lista abre para cima quando não cabe embaixo. */
  above: boolean;
}

/**
 * Campo único para escolher o cliente: digita para filtrar (nome ou CPF/CNPJ) e escolhe na
 * mesma lista, sem um segundo controle. A lista sai num portal para não ser cortada pelo card.
 */
export function ClientCombobox({ id, clients, value, onSelect, disabled }: ClientComboboxProps) {
  const selected = useMemo(() => clients.find((client) => client.id === value) ?? null, [clients, value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<ListRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Fora de edição, o campo mostra o nome do escolhido; ao abrir, a busca começa limpa.
  const display = open ? query : selected?.name ?? "";
  const matches = useMemo(() => filterClientOptions(clients, query, value), [clients, query, value]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const belowSpace = window.innerHeight - r.bottom - gap - 8;
    const aboveSpace = r.top - gap - 8;
    const wanted = 288; // max-h-72
    const above = belowSpace < 180 && aboveSpace > belowSpace;
    const maxHeight = Math.max(120, Math.min(wanted, above ? aboveSpace : belowSpace));
    setRect({
      left: r.left,
      top: above ? r.top - gap : r.bottom + gap,
      width: r.width,
      maxHeight,
      above,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, matches.length]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => place();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, place]);

  function choose(option: ClientPickerOption | null) {
    onSelect(option?.id ?? null, option?.locations.map((location) => location.id) ?? []);
    setOpen(false);
    setQuery("");
  }

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || (event.key === "Enter" && !open)) {
      event.preventDefault();
      if (!open) openList();
      else setActive((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const list =
    open && rect ? (
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        className="fixed z-50 overflow-auto rounded-lg border border-input bg-popover p-1 text-sm text-popover-foreground shadow-md"
        style={{
          left: rect.left,
          width: rect.width,
          maxHeight: rect.maxHeight,
          ...(rect.above ? { bottom: window.innerHeight - rect.top } : { top: rect.top }),
        }}
      >
        {matches.length === 0 ? (
          <li className="px-2 py-2 text-muted-foreground">Nenhum cliente encontrado</li>
        ) : (
          matches.map((option, index) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left",
                  index === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="truncate">
                  {option.name}
                  {option.document ? <span className="text-muted-foreground"> · {option.document}</span> : null}
                </span>
                {option.id === value ? <Check aria-hidden className="size-4 shrink-0" /> : null}
              </button>
            </li>
          ))
        )}
      </ul>
    ) : null;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        type="text"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={display}
        placeholder="Busque por nome ou CPF/CNPJ"
        className="pr-16"
        onFocus={openList}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
      />
      <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
        {selected && !disabled ? (
          <button
            type="button"
            aria-label="Limpar cliente"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(null)}
          >
            <X className="size-4" />
          </button>
        ) : null}
        <ChevronsUpDown aria-hidden className="size-4 text-muted-foreground" />
      </div>
      {typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}
