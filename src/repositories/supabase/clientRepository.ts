import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ClientRepository } from "@/services/clientService";
import type { Client, ClientContact, ClientListItem, ClientLocation } from "@/types/database";

/** Implementação Supabase do ClientRepository, com o client do usuário (RLS ativa). */
export function createSupabaseClientRepository(client: SupabaseClient): ClientRepository {
  function fail(error: unknown): never {
    throw new AppError("internal_error", "Falha ao acessar os clientes", error);
  }

  function clientColumns(input: { name: string; document: string | null; notes: string | null }) {
    return { name: input.name, document: input.document, notes: input.notes };
  }

  async function softDeleteRow(table: string, companyId: string, id: string): Promise<void> {
    const { error } = await client
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", id)
      .is("deleted_at", null);
    if (error) fail(error);
  }

  return {
    async list(companyId, { offset, limit, search }) {
      let query = client
        .from("clients")
        .select(
          "*, contacts:client_contacts(name, phone, is_primary, deleted_at), locations:client_locations(id, deleted_at)",
          { count: "exact" },
        )
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (search) {
        // A busca entra como padrão ilike; os curingas digitados valem como texto.
        const pattern = `%${search.replace(/[%_\\]/g, "\\$&")}%`;
        query = query.or(`name.ilike.${JSON.stringify(pattern)},document.ilike.${JSON.stringify(pattern)}`);
      }
      const { data, error, count } = await query.order("name").range(offset, offset + limit - 1);
      if (error) fail(error);

      type Row = Client & {
        contacts: { name: string; phone: string | null; is_primary: boolean; deleted_at: string | null }[];
        locations: { id: string; deleted_at: string | null }[];
      };
      const items: ClientListItem[] = ((data ?? []) as Row[]).map(({ contacts, locations, ...row }) => {
        const primary = contacts.find((contact) => contact.is_primary && !contact.deleted_at) ?? null;
        return {
          ...row,
          primary_contact_name: primary?.name ?? null,
          primary_contact_phone: primary?.phone ?? null,
          location_count: locations.filter((location) => !location.deleted_at).length,
        };
      });
      return { items, total: count ?? 0, page: 1, pageSize: limit };
    },

    async count(companyId) {
      const { count, error } = await client
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) fail(error);
      return count ?? 0;
    },

    async get(companyId, clientId) {
      const { data, error } = await client
        .from("clients")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", clientId)
        .is("deleted_at", null)
        .maybeSingle<Client>();
      if (error) fail(error);
      return data;
    },

    async insert(companyId, input) {
      const { data, error } = await client
        .from("clients")
        .insert({ company_id: companyId, ...clientColumns(input) })
        .select("*")
        .single<Client>();
      if (error) fail(error);
      return data;
    },

    async update(companyId, clientId, input) {
      const { error } = await client
        .from("clients")
        .update(clientColumns(input))
        .eq("company_id", companyId)
        .eq("id", clientId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    softDelete: (companyId, clientId) => softDeleteRow("clients", companyId, clientId),

    // Orçamentos e visitas entram aqui quando esses módulos existirem.
    async hasHistory() {
      return false;
    },

    async listContacts(companyId, clientId) {
      const { data, error } = await client
        .from("client_contacts")
        .select("*")
        .eq("company_id", companyId)
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false })
        .order("created_at");
      if (error) fail(error);
      return (data ?? []) as ClientContact[];
    },

    async insertContact(companyId, clientId, input) {
      const { data, error } = await client
        .from("client_contacts")
        .insert({
          company_id: companyId,
          client_id: clientId,
          name: input.name,
          role: input.role,
          phone: input.phone,
          email: input.email,
          is_primary: input.isPrimary,
        })
        .select("*")
        .single<ClientContact>();
      if (error) fail(error);
      return data;
    },

    async updateContact(companyId, contactId, input) {
      const { error } = await client
        .from("client_contacts")
        .update({
          name: input.name,
          role: input.role,
          phone: input.phone,
          email: input.email,
          is_primary: input.isPrimary,
        })
        .eq("company_id", companyId)
        .eq("id", contactId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    softDeleteContact: (companyId, contactId) => softDeleteRow("client_contacts", companyId, contactId),

    async setPrimaryContact(companyId, contactId) {
      const { error } = await client
        .from("client_contacts")
        .update({ is_primary: true })
        .eq("company_id", companyId)
        .eq("id", contactId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    async listLocations(companyId, clientId) {
      const { data, error } = await client
        .from("client_locations")
        .select("*")
        .eq("company_id", companyId)
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("created_at");
      if (error) fail(error);
      return (data ?? []) as ClientLocation[];
    },

    async insertLocation(companyId, clientId, input) {
      const { data, error } = await client
        .from("client_locations")
        .insert({ company_id: companyId, client_id: clientId, ...input })
        .select("*")
        .single<ClientLocation>();
      if (error) fail(error);
      return data;
    },

    async updateLocation(companyId, locationId, input) {
      const { error } = await client
        .from("client_locations")
        .update(input)
        .eq("company_id", companyId)
        .eq("id", locationId)
        .is("deleted_at", null);
      if (error) fail(error);
    },

    softDeleteLocation: (companyId, locationId) => softDeleteRow("client_locations", companyId, locationId),

    // Orçamentos e visitas entram aqui quando esses módulos existirem.
    async locationHasHistory() {
      return false;
    },
  };
}
