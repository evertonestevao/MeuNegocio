import { ShieldCheck } from "lucide-react";
import { OWNERSHIP_STATEMENT } from "@/features/company/declaration";

/**
 * Declaração de responsabilidade pela empresa. O required é só ajuda na tela: o servidor recusa sem
 * ela e grava o texto exato, com data, IP e navegador.
 */
export function OwnershipDeclaration() {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
      <input type="checkbox" name="ownership_declaration" required className="mt-0.5 size-4 shrink-0 accent-primary" />
      <span className="flex flex-col gap-1">
        <span>
          {OWNERSHIP_STATEMENT}{" "}
          <span className="text-destructive" aria-hidden>
            *
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          Guardamos esta declaração com data e IP. Usar o nome ou o CNPJ de outra empresa é proibido pelos Termos de Uso.
        </span>
      </span>
    </label>
  );
}
