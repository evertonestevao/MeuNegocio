import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ClientImport } from "@/features/clients/components/client-import";
import { getClientService } from "@/server/clients";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Importar clientes" };

export default async function ImportClientsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageClients(active.role)) redirect("/dashboard");

  // Nome e documento dos clientes atuais: a prévia já mostra quem está cadastrado.
  const existing = await (await getClientService()).listIdentities({ companyId: active.id, role: active.role });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/dashboard/clients" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Clientes
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Importar clientes</h1>
        <p className="text-sm text-muted-foreground">Traga sua lista de clientes de uma planilha, com contato e endereço, de uma vez.</p>
      </div>
      <ClientImport existing={existing} />
    </div>
  );
}
