import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Building2, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewClientButton } from "@/features/clients/components/client-forms";
import { getClientService } from "@/server/clients";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";
import { formatDocument } from "@/lib/masks";
import { InitialsAvatar } from "@/components/initials-avatar";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: rawPage, q } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageClients(active.role)) redirect("/dashboard");

  const service = await getClientService();
  const clients = await service.list(
    { companyId: active.id, role: active.role },
    { page: Number(rawPage) || 1, search: q },
  );
  const search = q?.trim() ?? "";
  const summary = (client: (typeof clients.items)[number]) =>
    [
      client.document ? formatDocument(client.document) : null,
      `${client.location_count} ${client.location_count === 1 ? "local" : "locais"}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:[&>*]:w-full">
        <div>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">Clientes</h2>
          <p className="text-sm text-muted-foreground">Empresas atendidas, com contatos e locais de serviço.</p>
        </div>
        <NewClientButton />
      </div>

      <form action="/dashboard/clients" className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={search} placeholder="Buscar por nome ou documento" aria-label="Buscar clientes" />
        <Button type="submit" variant="outline">
          <Search className="size-4" /> Buscar
        </Button>
      </form>

      {clients.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={search ? "Tente outro nome ou documento." : "Cadastre o primeiro cliente para criar orçamentos e visitas."}
        />
      ) : (
        <>
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato principal</TableHead>
                  <TableHead>Locais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.items.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link href={`/dashboard/clients/${client.id}`} className="font-medium hover:underline">
                        {client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.document ? formatDocument(client.document) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[client.primary_contact_name, client.primary_contact_phone].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.location_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex flex-col gap-3 md:hidden">
            {clients.items.map((client) => (
              <Link key={client.id} href={`/dashboard/clients/${client.id}`}>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <InitialsAvatar name={client.name} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="break-words text-base font-medium">{client.name}</span>
                      <span className="text-sm text-muted-foreground">{summary(client)}</span>
                      {client.primary_contact_name ? (
                        <span className="text-sm text-muted-foreground">
                          {[client.primary_contact_name, client.primary_contact_phone].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <PaginationControls
            page={clients.page}
            pageSize={clients.pageSize}
            total={clients.total}
            basePath="/dashboard/clients"
          />
        </>
      )}
    </div>
  );
}
