import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContactFormButton,
  DeleteClientButton,
  EditClientButton,
  LocationFormButton,
  RemoveContactButton,
  RemoveLocationButton,
} from "@/features/clients/components/client-forms";
import { getClientService } from "@/server/clients";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageClients(active.role)) redirect("/dashboard");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const service = await getClientService();
  const detail = await service.getDetail({ companyId: active.id, role: active.role }, id);
  if (!detail) notFound();
  const { client, contacts, locations } = detail;
  const canDelete = permissionService.canDeleteRecords(active.role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/dashboard/clients"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Clientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight break-words">{client.name}</h2>
            {client.document ? <p className="text-sm text-muted-foreground">{client.document}</p> : null}
          </div>
          <EditClientButton client={client} />
        </div>
        {client.notes ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{client.notes}</p>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Contatos</CardTitle>
            <ContactFormButton clientId={client.id} />
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {contact.name}
                        {contact.is_primary ? <Badge>Principal</Badge> : null}
                      </span>
                      {contact.role ? <span className="text-muted-foreground">{contact.role}</span> : null}
                      {contact.phone ? (
                        <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="w-fit hover:underline">
                          {contact.phone}
                        </a>
                      ) : null}
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="w-fit break-all hover:underline">
                          {contact.email}
                        </a>
                      ) : null}
                    </div>
                    <div className="flex shrink-0">
                      <ContactFormButton clientId={client.id} contact={contact} />
                      {canDelete ? <RemoveContactButton clientId={client.id} contact={contact} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Locais de atendimento</CardTitle>
            <LocationFormButton clientId={client.id} />
          </CardHeader>
          <CardContent>
            {locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum local cadastrado.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {locations.map((location) => (
                  <li key={location.id} className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        {location.name}
                      </span>
                      <span className="text-muted-foreground">{location.address}</span>
                      {location.notes ? <span className="text-xs text-muted-foreground">{location.notes}</span> : null}
                    </div>
                    <div className="flex shrink-0">
                      <LocationFormButton clientId={client.id} location={location} />
                      {canDelete ? <RemoveLocationButton clientId={client.id} location={location} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canDelete ? (
        <div className="flex justify-end">
          <DeleteClientButton client={client} />
        </div>
      ) : null}
    </div>
  );
}
