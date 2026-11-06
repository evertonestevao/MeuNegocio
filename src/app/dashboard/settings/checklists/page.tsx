import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ChecklistTemplateForm } from "@/features/checklists/components/checklist-template-form";
import { getChecklistService } from "@/server/checklists";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Checklists" };

export default async function ChecklistsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canEditCompany(active.role)) redirect("/dashboard/settings");

  const templates = await (await getChecklistService()).list({ companyId: active.id, role: active.role });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/dashboard/settings" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Configurações
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Checklists</h1>
        <p className="text-sm text-muted-foreground">
          Itens que cada ordem de serviço já traz ao ser iniciada. Mudar aqui não altera ordens já iniciadas. Para ajustar um atendimento só, edite a visita na agenda.
        </p>
      </div>
      <ChecklistTemplateForm
        kind="execution"
        title="Execução do serviço"
        description="Usado nas visitas de execução."
        initialLabels={templates.execution}
      />
      <ChecklistTemplateForm
        kind="assessment"
        title="Visita técnica"
        description="Usado nas visitas para orçamento."
        initialLabels={templates.assessment}
      />
    </div>
  );
}
