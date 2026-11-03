"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadServiceCostPdf, type ServiceCostPdfInput } from "../pdf";

export function ServiceCostPdfButton({ input }: { input: ServiceCostPdfInput }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await downloadServiceCostPdf(input);
        } catch {
          toast.error("Não foi possível gerar o relatório. Tente novamente.");
        } finally {
          setPending(false);
        }
      }}
    >
      <FileDown className="size-4" /> {pending ? "Gerando..." : "Relatório do serviço"}
    </Button>
  );
}
