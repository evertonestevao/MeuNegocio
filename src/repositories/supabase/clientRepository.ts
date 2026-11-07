import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { searchTerms } from "@/lib/search";
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
        // Padrão ilike; os curingas digitados valem como texto.
        const pattern = (value: string) => JSON.stringify(`%${value.replace(/[%_\\]/g, "\\$&")}%`);
        const { text, digits } = searchTerms(search);
        const conditions = [`search_text.ilike.${pattern(text)}`];
        if (digits) {
          conditions.push(`search_text.ilike.${pattern(digits)}`);
          // Telefone fica nos contatos: acha os clientes deles primeiro.
          const { data: contacts, error: contactsError } = await client
            .from("client_contacts")
            .select("client_id")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .or(`phone_digits.ilike.${pattern(digits)}`)
            .limit(200);
          if (contactsError) fail(contactsError);
          const ids = [...new Set((contacts ?? []).map((contact: { client_id: string }) => contact.client_id))];
          if (ids.length > 0) conditions.push(`id.in.(${ids.join(",")})`);
        }
        query = query.or(conditions.join(","));
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

    async listForPicker(companyId) {
      const { data, error } = await client
        .from("clients")
        .select("id, name, document, locations:client_locations(id, name, deleted_at)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) fail(error);
      type Row = { id: string; name: string; document: string | null; locations: { id: string; name: string; deleted_at: string | null }[] };
      return ((data ?? []) as Row[]).map((row) => ({
        id: row.id,
        name: row.name,
        document: row.document,
        locations: row.locations.filter((location) => !location.deleted_at).map(({ id, name }) => ({ id, name })),
      }));
    },

    async listIdentities(companyId) {
      const { data, error } = await client.from("clients").select("name, document").eq("company_id", companyId).is("deleted_at", null).limit(20000);
      if (error) fail(error);
      return (data ?? []) as { name: string; document: string | null }[];
    },

    async importMany(companyId, rows) {
      const { data, error } = await client.rpc("import_clients", { p_company_id: companyId, p_rows: rows });
      if (error) fail(error);
      return data as number;
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

    async hasHistory(companyId, clientId) {
      const counts = await Promise.all(
        ["quotes", "visits", "time_entries"].map((table) =>
          client
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("client_id", clientId)
            .is("deleted_at", null),
        ),
      );
      for (const { error } of counts) if (error) fail(error);
      return counts.some(({ count }) => (count ?? 0) > 0);
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

    async locationHasHistory(companyId, locationId) {
      const counts = await Promise.all(
        ["quotes", "visits"].map((table) =>
          client
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("location_id", locationId)
            .is("deleted_at", null),
        ),
      );
      for (const { error } of counts) if (error) fail(error);
      return counts.some(({ count }) => (count ?? 0) > 0);
    },
  };
}
