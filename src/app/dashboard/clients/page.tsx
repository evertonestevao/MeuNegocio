import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Building2, FileUp, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewClientButton } from "@/features/clients/components/client-forms";
import { getClientService } from "@/server/clients";
import { CLIENT_KIND_LABEL, parseClientKind } from "@/services/clientService";
import { contactSummary } from "@/features/clients/picker";
import { CollapsibleFilters } from "@/components/collapsible-filters";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";
import { formatDocument } from "@/lib/masks";
import { InitialsAvatar } from "@/components/initials-avatar";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tipo?: string; cidade?: string }>;
}) {
  const { page: rawPage, q, tipo, cidade } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageClients(active.role)) redirect("/dashboard");

  const service = await getClientService();
  const clients = await service.list(
    { companyId: active.id, role: active.role },
    { page: Number(rawPage) || 1, search: q, kind: tipo, city: cidade },
  );
  const search = q?.trim() ?? "";
  const kind = parseClientKind(tipo);
  const city = cidade?.trim() ?? "";
  const filtered = Boolean(search || kind || city);
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
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Empresas atendidas, com contatos e locais de serviço.</p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
          <Button variant="outline" render={<Link href="/dashboard/clients/importar" />} nativeButton={false}>
            <FileUp className="size-4" /> Importar planilha
          </Button>
          <NewClientButton />
        </div>
      </div>

      <form action="/dashboard/clients" className="flex flex-col gap-2" role="search">
        <div className="flex max-w-xl gap-2">
          <Input name="q" defaultValue={search} placeholder="Nome, CPF, telefone, cidade" aria-label="Buscar clientes" />
          <Button type="submit" variant="outline">
            <Search className="size-4" /> Buscar
          </Button>
        </div>
        <CollapsibleFilters active={Boolean(kind || city)}>
          <select
            name="tipo"
            defaultValue={kind ?? ""}
            aria-label="Tipo de cliente"
            className="border-input h-11 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 dark:bg-input/30"
          >
            <option value="">Todos os tipos</option>
            {(Object.keys(CLIENT_KIND_LABEL) as (keyof typeof CLIENT_KIND_LABEL)[]).map((value) => (
              <option key={value} value={value}>
                {CLIENT_KIND_LABEL[value]}
              </option>
            ))}
          </select>
          <Input name="cidade" defaultValue={city} placeholder="Cidade" aria-label="Cidade" className="max-w-48" />
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          {filtered ? (
            <Link href="/dashboard/clients" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Limpar filtros
            </Link>
          ) : null}
        </CollapsibleFilters>
      </form>

      {clients.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={filtered ? "Tente outro nome, documento ou cidade, ou limpe os filtros." : "Cadastre o primeiro cliente ou traga sua lista de uma planilha, com contato e endereço."}
          action={
            filtered ? undefined : (
              <Button variant="outline" render={<Link href="/dashboard/clients/importar" />} nativeButton={false}>
                <FileUp className="size-4" /> Importar planilha
              </Button>
            )
          }
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
                      {contactSummary(client) ?? "—"}
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
                      {contactSummary(client) ? <span className="text-sm text-muted-foreground">{contactSummary(client)}</span> : null}
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
            params={{ q: search, tipo: kind, cidade: city }}
          />
        </>
      )}
    </div>
  );
}
