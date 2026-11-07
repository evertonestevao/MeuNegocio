"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Filtros de uma lista. No computador, sempre à vista; no celular, atrás de "Filtros", para a lista
 * começar no alto da tela. Com filtro aplicado, já abrem.
 */
export function CollapsibleFilters({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(active);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="w-fit sm:hidden" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <SlidersHorizontal className="size-4" /> Filtros{active ? " (ativos)" : ""}
      </Button>
      {/* Escondido só pelo CSS: os campos continuam no formulário e a busca leva os filtros junto. */}
      <div className={`flex-wrap items-center gap-2 sm:flex ${open ? "flex" : "hidden"}`}>{children}</div>
    </div>
  );
}
