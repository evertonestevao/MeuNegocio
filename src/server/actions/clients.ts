"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  parseClientForm,
  parseContactForm,
  parseLocationForm,
} from "@/features/clients/schemas";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { getClientService } from "@/server/clients";
import { getActor } from "@/server/actor";
import { toActionError, type ActionState } from "./action-state";

function idFrom(formData: FormData, key: string): string {
  const parsed = z.uuid().safeParse(formData.get(key));
  if (!parsed.success) throw new AppError("validation_error", "Registro inválido");
  return parsed.data;
}

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function refresh(clientId?: string): void {
  revalidatePath("/dashboard/clients");
  if (clientId) revalidatePath(`/dashboard/clients/${clientId}`);
}

export async function createClientAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let clientId: string;
  try {
    const actor = await getActor();
    const service = await getClientService();
    const created = await service.create(actor, parseClientForm(formData));
    clientId = created.id;
    await recordAudit({ companyId: actor.companyId, action: "client.created", entityType: "client", entityId: clientId });
    refresh();
  } catch (err) {
    return handleError(err);
  }
  redirect(`/dashboard/clients/${clientId}`);
}

export async function updateClientAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const clientId = idFrom(formData, "clientId");
    const service = await getClientService();
    await service.update(actor, clientId, parseClientForm(formData));
    await recordAudit({ companyId: actor.companyId, action: "client.updated", entityType: "client", entityId: clientId });
    refresh(clientId);
    return { success: "Cliente salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteClientAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const clientId = idFrom(formData, "clientId");
    const service = await getClientService();
    await service.remove(actor, clientId);
    await recordAudit({ companyId: actor.companyId, action: "client.deleted", entityType: "client", entityId: clientId });
    refresh();
  } catch (err) {
    return handleError(err);
  }
  redirect("/dashboard/clients");
}

export async function saveContactAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const clientId = idFrom(formData, "clientId");
    const input = parseContactForm(formData);
    const service = await getClientService();
    if (formData.get("contactId")) {
      const contactId = idFrom(formData, "contactId");
      await service.updateContact(actor, clientId, contactId, input);
      await recordAudit({ companyId: actor.companyId, action: "client_contact.updated", entityType: "client_contact", entityId: contactId, metadata: { client_id: clientId } });
    } else {
      const contact = await service.addContact(actor, clientId, input);
      await recordAudit({ companyId: actor.companyId, action: "client_contact.created", entityType: "client_contact", entityId: contact.id, metadata: { client_id: clientId } });
    }
    refresh(clientId);
    return { success: "Contato salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function removeContactAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const clientId = idFrom(formData, "clientId");
    const contactId = idFrom(formData, "contactId");
    const service = await getClientService();
    await service.removeContact(actor, clientId, contactId);
    await recordAudit({ companyId: actor.companyId, action: "client_contact.deleted", entityType: "client_contact", entityId: contactId, metadata: { client_id: clientId } });
    refresh(clientId);
    return { success: "Contato removido" };
  } catch (err) {
    return handleError(err);
  }
}

export async function saveLocationAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const clientId = idFrom(formData, "clientId");
    const input = parseLocationForm(formData);
    const service = await getClientService();
    if (formData.get("locationId")) {
      const locationId = idFrom(formData, "locationId");
      await service.updateLocation(actor, clientId, locationId, input);
      await recordAudit({ companyId: actor.companyId, action: "client_location.updated", entityType: "client_location", entityId: locationId, metadata: { client_id: clientId } });
    } else {
      const location = await service.addLocation(actor, clientId, input);
      await recordAudit({ companyId: actor.companyId, action: "client_location.created", entityType: "client_location", entityId: location.id, metadata: { client_id: clientId } });
    }
    refresh(clientId);
    return { success: "Local salvo" };
  } catch (err) {
    return handleError(err);
  }
}

export async function removeLocationAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const clientId = idFrom(formData, "clientId");
    const locationId = idFrom(formData, "locationId");
    const service = await getClientService();
    await service.removeLocation(actor, clientId, locationId);
    await recordAudit({ companyId: actor.companyId, action: "client_location.deleted", entityType: "client_location", entityId: locationId, metadata: { client_id: clientId } });
    refresh(clientId);
    return { success: "Local removido" };
  } catch (err) {
    return handleError(err);
  }
}
