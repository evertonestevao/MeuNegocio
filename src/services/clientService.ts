import type { ClientInput, ContactInput, LocationInput } from "@/features/clients/schemas";
import { formatDocument } from "@/features/clients/schemas";
import { AppError } from "@/lib/errors";
import type { Client, ClientContact, ClientLocation, ClientListItem, ClientPickerOption } from "@/types/database";
import { permissionService } from "./permissionService";
import { normalizePageParams, type PageParams, type Paginated } from "./tenantService";
import { z } from "zod";
import { importRowSchema, MAX_IMPORT_ROWS, previewImport, type ImportRow } from "@/features/clients/import";

/**
 * Clientes, contatos e locais de atendimento. Toda operação recebe a empresa ativa e o papel
 * de quem age, já resolvidos no servidor, e confere que o registro é dessa empresa.
 */

const CLIENTS_PAGE_SIZE = 20;

export interface ClientRepository {
  list(companyId: string, params: { offset: number; limit: number; search: string | null }): Promise<Paginated<ClientListItem>>;
  count(companyId: string): Promise<number>;
  /** Clientes e locais para o seletor do orçamento e da agenda. */
  listForPicker(companyId: string): Promise<ClientPickerOption[]>;
  get(companyId: string, clientId: string): Promise<Client | null>;
  insert(companyId: string, input: ClientInput): Promise<Client>;
  update(companyId: string, clientId: string, input: ClientInput): Promise<void>;
  softDelete(companyId: string, clientId: string): Promise<void>;
  /** Cliente com orçamento ou visita não pode ser excluído. */
  hasHistory(companyId: string, clientId: string): Promise<boolean>;

  listContacts(companyId: string, clientId: string): Promise<ClientContact[]>;
  insertContact(companyId: string, clientId: string, input: ContactInput): Promise<ClientContact>;
  updateContact(companyId: string, contactId: string, input: ContactInput): Promise<void>;
  softDeleteContact(companyId: string, contactId: string): Promise<void>;
  setPrimaryContact(companyId: string, contactId: string): Promise<void>;

  listLocations(companyId: string, clientId: string): Promise<ClientLocation[]>;
  insertLocation(companyId: string, clientId: string, input: LocationInput): Promise<ClientLocation>;
  updateLocation(companyId: string, locationId: string, input: LocationInput): Promise<void>;
  softDeleteLocation(companyId: string, locationId: string): Promise<void>;
  /** Local usado em orçamento ou visita não pode ser removido. */
  locationHasHistory(companyId: string, locationId: string): Promise<boolean>;

  /** Nome e documento de todos os clientes, para não importar duplicado. */
  listIdentities(companyId: string): Promise<{ name: string; document: string | null }[]>;
  /** Grava tudo numa transação: ou entram todos, ou nenhum. */
  importMany(companyId: string, rows: ImportRow[]): Promise<number>;
}

interface ClientServiceDeps {
  repo: ClientRepository;
  /** Limite de clientes do plano da empresa; null é ilimitado. */
  getClientLimit(companyId: string): Promise<number | null>;
}

export interface ActorContext {
  companyId: string;
  role: string;
}

function requireManage({ role }: ActorContext): void {
  if (!permissionService.canManageClients(role)) {
    throw new AppError("forbidden", "Sem permissão para acessar clientes");
  }
}

function requireDelete({ role }: ActorContext): void {
  if (!permissionService.canDeleteRecords(role)) {
    throw new AppError("forbidden", "Só o proprietário e o administrador podem excluir");
  }
}

function normalizeClient(input: ClientInput): ClientInput {
  return { ...input, document: input.document ? formatDocument(input.document) : null };
}

export function createClientService({ repo, getClientLimit }: ClientServiceDeps) {
  async function requireClient(actor: ActorContext, clientId: string): Promise<Client> {
    const client = await repo.get(actor.companyId, clientId);
    if (!client) throw new AppError("not_found", "Cliente não encontrado");
    return client;
  }

  async function requireContact(actor: ActorContext, clientId: string, contactId: string): Promise<ClientContact[]> {
    const contacts = await repo.listContacts(actor.companyId, clientId);
    if (!contacts.some((contact) => contact.id === contactId)) {
      throw new AppError("not_found", "Contato não encontrado");
    }
    return contacts;
  }

  async function requireLocation(actor: ActorContext, clientId: string, locationId: string): Promise<void> {
    const locations = await repo.listLocations(actor.companyId, clientId);
    if (!locations.some((location) => location.id === locationId)) {
      throw new AppError("not_found", "Local não encontrado");
    }
  }

  return {
    async list(actor: ActorContext, params: PageParams & { search?: string }) {
      requireManage(actor);
      const { page, pageSize, offset } = normalizePageParams(params, CLIENTS_PAGE_SIZE);
      const result = await repo.list(actor.companyId, {
        offset,
        limit: pageSize,
        search: params.search?.trim() || null,
      });
      return { ...result, page, pageSize };
    },

    async listForPicker(actor: ActorContext): Promise<ClientPickerOption[]> {
      requireManage(actor);
      return repo.listForPicker(actor.companyId);
    },

    async getDetail(actor: ActorContext, clientId: string) {
      requireManage(actor);
      const client = await repo.get(actor.companyId, clientId);
      if (!client) return null;
      const [contacts, locations] = await Promise.all([
        repo.listContacts(actor.companyId, clientId),
        repo.listLocations(actor.companyId, clientId),
      ]);
      return { client, contacts, locations };
    },

    /** Nome e documento de todos os clientes, para a prévia da importação. */
    async listIdentities(actor: ActorContext) {
      requireManage(actor);
      return repo.listIdentities(actor.companyId);
    },

    /**
     * Importa clientes de uma planilha. Confere de novo cada linha e os duplicados (outra pessoa
     * pode ter cadastrado no meio tempo), que são pulados, e o limite de clientes do plano.
     */
    async importMany(actor: ActorContext, input: unknown): Promise<{ imported: number; skipped: number }> {
      requireManage(actor);
      const rows = z.array(importRowSchema).min(1, "Nenhum cliente para importar.").max(MAX_IMPORT_ROWS, `Importe até ${MAX_IMPORT_ROWS} clientes por vez.`).parse(input);
      const existing = await repo.listIdentities(actor.companyId);
      const fresh = previewImport(
        [["Nome", "CPF/CNPJ"], ...rows.map((row) => [row.name, row.document ?? ""])],
        existing,
      ).flatMap((line, index) => (line.status === "ready" ? [rows[index]] : []));
      if (fresh.length === 0) return { imported: 0, skipped: rows.length };
      const limit = await getClientLimit(actor.companyId);
      if (limit !== null && existing.length + fresh.length > limit) {
        throw new AppError("conflict", `Seu plano permite até ${limit} clientes. Hoje são ${existing.length}; importe no máximo ${Math.max(0, limit - existing.length)}.`);
      }
      const imported = await repo.importMany(actor.companyId, fresh);
      return { imported, skipped: rows.length - imported };
    },

    async create(actor: ActorContext, input: ClientInput): Promise<Client> {
      requireManage(actor);
      const limit = await getClientLimit(actor.companyId);
      if (limit !== null && (await repo.count(actor.companyId)) >= limit) {
        throw new AppError(
          "conflict",
          `Seu plano permite até ${limit} clientes. Os cadastros atuais continuam disponíveis; troque de plano para criar novos.`,
        );
      }
      return repo.insert(actor.companyId, normalizeClient(input));
    },

    async update(actor: ActorContext, clientId: string, input: ClientInput): Promise<void> {
      requireManage(actor);
      await requireClient(actor, clientId);
      await repo.update(actor.companyId, clientId, normalizeClient(input));
    },

    async remove(actor: ActorContext, clientId: string): Promise<void> {
      requireDelete(actor);
      await requireClient(actor, clientId);
      if (await repo.hasHistory(actor.companyId, clientId)) {
        throw new AppError(
          "conflict",
          "Este cliente tem orçamentos ou visitas. Para manter o histórico, não é possível excluir.",
        );
      }
      await repo.softDelete(actor.companyId, clientId);
    },

    /** O primeiro contato do cliente já nasce principal. */
    async addContact(actor: ActorContext, clientId: string, input: ContactInput): Promise<ClientContact> {
      requireManage(actor);
      await requireClient(actor, clientId);
      const contacts = await repo.listContacts(actor.companyId, clientId);
      return repo.insertContact(actor.companyId, clientId, {
        ...input,
        isPrimary: input.isPrimary || contacts.length === 0,
      });
    },

    /** O cliente nunca fica sem principal enquanto tiver contatos: o único segue marcado. */
    async updateContact(actor: ActorContext, clientId: string, contactId: string, input: ContactInput): Promise<void> {
      requireManage(actor);
      const contacts = await requireContact(actor, clientId, contactId);
      const isCurrentPrimary = contacts.some((contact) => contact.id === contactId && contact.is_primary);
      await repo.updateContact(actor.companyId, contactId, {
        ...input,
        isPrimary: input.isPrimary || isCurrentPrimary,
      });
    },

    /** Removido o principal, o contato mais antigo que restou assume. */
    async removeContact(actor: ActorContext, clientId: string, contactId: string): Promise<void> {
      requireDelete(actor);
      const contacts = await requireContact(actor, clientId, contactId);
      await repo.softDeleteContact(actor.companyId, contactId);
      const removed = contacts.find((contact) => contact.id === contactId);
      const next = contacts.find((contact) => contact.id !== contactId);
      if (removed?.is_primary && next) {
        await repo.setPrimaryContact(actor.companyId, next.id);
      }
    },

    async addLocation(actor: ActorContext, clientId: string, input: LocationInput): Promise<ClientLocation> {
      requireManage(actor);
      await requireClient(actor, clientId);
      return repo.insertLocation(actor.companyId, clientId, input);
    },

    async updateLocation(actor: ActorContext, clientId: string, locationId: string, input: LocationInput): Promise<void> {
      requireManage(actor);
      await requireLocation(actor, clientId, locationId);
      await repo.updateLocation(actor.companyId, locationId, input);
    },

    async removeLocation(actor: ActorContext, clientId: string, locationId: string): Promise<void> {
      requireDelete(actor);
      await requireLocation(actor, clientId, locationId);
      if (await repo.locationHasHistory(actor.companyId, locationId)) {
        throw new AppError("conflict", "Este local tem visitas ou orçamentos e não pode ser removido.");
      }
      await repo.softDeleteLocation(actor.companyId, locationId);
    },
  };
}

export type ClientService = ReturnType<typeof createClientService>;
