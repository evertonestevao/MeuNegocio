"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Ícone "i" com dica ao passar o mouse ou focar (acessível pelo teclado e no toque). */
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={text}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        }
      />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
