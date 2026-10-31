import "server-only";
import { getClientService } from "./clients";
import { getCatalogService, getCompanyProfileService } from "./quotes";
import type { ActorContext } from "./actor";

export async function loadQuoteEditorData(actor: ActorContext) {
  const [clientService, catalogService, profileService] = await Promise.all([
    getClientService(),
    getCatalogService(),
    getCompanyProfileService(),
  ]);
  const [clients, catalog, profile] = await Promise.all([
    clientService.listForPicker(actor),
    catalogService.list(actor),
    profileService.get(actor.companyId),
  ]);
  return { clients, catalog, profile };
}
