import { describe, expect, it, vi } from "vitest";
import type { ClientInput, ContactInput, LocationInput } from "@/features/clients/schemas";
import { parseClientForm, parseContactForm } from "@/features/clients/schemas";
import type { Client, ClientContact, ClientLocation } from "@/types/database";
import { createClientService, type ActorContext, type ClientRepository } from "./clientService";

const OWNER: ActorContext = { companyId: "co-1", role: "owner" };
const MEMBER: ActorContext = { companyId: "co-1", role: "member" };
const TECHNICIAN: ActorContext = { companyId: "co-1", role: "technician" };

const CLIENT_INPUT: ClientInput = { name: "Hotel", document: null, notes: null };
const CONTACT_INPUT: ContactInput = { name: "Ana", role: null, phone: null, email: null, isPrimary: false };
const LOCATION_INPUT: LocationInput = { name: "Sede", address: "Rua A, 10", notes: null };

function contact(overrides: Partial<ClientContact>): ClientContact {
  return {
    id: "ct-1",
    company_id: "co-1",
    client_id: "cl-1",
    name: "Ana",
    role: null,
    phone: null,
    email: null,
    is_primary: false,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function location(overrides: Partial<ClientLocation>): ClientLocation {
  return {
    id: "lo-1",
    company_id: "co-1",
    client_id: "cl-1",
    name: "Sede",
    address: "Rua A, 10",
    notes: null,
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const CLIENT = { id: "cl-1", company_id: "co-1", name: "Hotel" } as Client;

function makeRepo() {
  return {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    count: vi.fn(async () => 0),
    listForPicker: vi.fn(async () => []),
    get: vi.fn(async (): Promise<Client | null> => CLIENT),
    insert: vi.fn(async () => CLIENT),
    update: vi.fn(async () => undefined),
    softDelete: vi.fn(async () => undefined),
    hasHistory: vi.fn(async () => false),
    listContacts: vi.fn(async (): Promise<ClientContact[]> => []),
    insertContact: vi.fn(async () => contact({})),
    updateContact: vi.fn(async () => undefined),
    softDeleteContact: vi.fn(async () => undefined),
    setPrimaryContact: vi.fn(async () => undefined),
    listLocations: vi.fn(async (): Promise<ClientLocation[]> => []),
    insertLocation: vi.fn(async () => location({})),
    updateLocation: vi.fn(async () => undefined),
    softDeleteLocation: vi.fn(async () => undefined),
    locationHasHistory: vi.fn(async () => false),
    listIdentities: vi.fn(async (): Promise<{ name: string; document: string | null }[]> => [{ name: "Hotel Central", document: "11444777000161" }]),
    importMany: vi.fn(async (_companyId: string, rows: unknown[]) => rows.length),
  } satisfies ClientRepository;
}

function makeService(repo = makeRepo(), limit: number | null = null) {
  return createClientService({ repo, getClientLimit: async () => limit });
}

describe("clientes", () => {
  it("técnico não acessa clientes", async () => {
    const service = makeService();
    await expect(service.list(TECHNICIAN, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.getDetail(TECHNICIAN, "cl-1")).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.create(TECHNICIAN, CLIENT_INPUT)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member cria e edita, mas não exclui", async () => {
    const repo = makeRepo();
    const service = makeService(repo);
    await service.create(MEMBER, CLIENT_INPUT);
    await service.update(MEMBER, "cl-1", CLIENT_INPUT);
    await expect(service.remove(MEMBER, "cl-1")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it("respeita o limite do plano e aceita ilimitado", async () => {
    const repo = makeRepo();
    repo.count.mockResolvedValue(30);
    await expect(makeService(repo, 30).create(OWNER, CLIENT_INPUT)).rejects.toMatchObject({ code: "conflict" });
    expect(repo.insert).not.toHaveBeenCalled();
    await makeService(repo, null).create(OWNER, CLIENT_INPUT);
    expect(repo.insert).toHaveBeenCalledOnce();
  });

  it("guarda o documento com pontuação", async () => {
    const repo = makeRepo();
    await makeService(repo).create(OWNER, { ...CLIENT_INPUT, document: "11222333000181" });
    expect(repo.insert).toHaveBeenCalledWith("co-1", expect.objectContaining({ document: "11.222.333/0001-81" }));
  });

  it("cliente de outra empresa não é encontrado", async () => {
    const repo = makeRepo();
    repo.get.mockResolvedValue(null);
    const service = makeService(repo);
    await expect(service.update(OWNER, "alheio", CLIENT_INPUT)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.remove(OWNER, "alheio")).rejects.toMatchObject({ code: "not_found" });
    await expect(service.addContact(OWNER, "alheio", CONTACT_INPUT)).rejects.toMatchObject({ code: "not_found" });
    expect(await service.getDetail(OWNER, "alheio")).toBeNull();
  });

  it("não exclui cliente com histórico", async () => {
    const repo = makeRepo();
    repo.hasHistory.mockResolvedValue(true);
    await expect(makeService(repo).remove(OWNER, "cl-1")).rejects.toThrow("não é possível excluir");
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

describe("contatos", () => {
  it("o primeiro contato nasce principal", async () => {
    const repo = makeRepo();
    await makeService(repo).addContact(OWNER, "cl-1", CONTACT_INPUT);
    expect(repo.insertContact).toHaveBeenCalledWith("co-1", "cl-1", expect.objectContaining({ isPrimary: true }));
  });

  it("os seguintes só são principais se pedido", async () => {
    const repo = makeRepo();
    repo.listContacts.mockResolvedValue([contact({ is_primary: true })]);
    await makeService(repo).addContact(OWNER, "cl-1", CONTACT_INPUT);
    expect(repo.insertContact).toHaveBeenCalledWith("co-1", "cl-1", expect.objectContaining({ isPrimary: false }));
  });

  it("editar não tira a marca do contato principal", async () => {
    const repo = makeRepo();
    repo.listContacts.mockResolvedValue([contact({ id: "ct-1", is_primary: true })]);
    await makeService(repo).updateContact(OWNER, "cl-1", "ct-1", CONTACT_INPUT);
    expect(repo.updateContact).toHaveBeenCalledWith("co-1", "ct-1", expect.objectContaining({ isPrimary: true }));
  });

  it("remover o principal promove o próximo", async () => {
    const repo = makeRepo();
    repo.listContacts.mockResolvedValue([
      contact({ id: "ct-1", is_primary: true }),
      contact({ id: "ct-2" }),
    ]);
    await makeService(repo).removeContact(OWNER, "cl-1", "ct-1");
    expect(repo.softDeleteContact).toHaveBeenCalledWith("co-1", "ct-1");
    expect(repo.setPrimaryContact).toHaveBeenCalledWith("co-1", "ct-2");
  });

  it("recusa contato de outro cliente", async () => {
    const repo = makeRepo();
    repo.listContacts.mockResolvedValue([contact({ id: "ct-2" })]);
    await expect(makeService(repo).removeContact(OWNER, "cl-1", "ct-9")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.softDeleteContact).not.toHaveBeenCalled();
  });
});

describe("locais", () => {
  it("não remove local com histórico", async () => {
    const repo = makeRepo();
    repo.listLocations.mockResolvedValue([location({})]);
    repo.locationHasHistory.mockResolvedValue(true);
    await expect(makeService(repo).removeLocation(OWNER, "cl-1", "lo-1")).rejects.toThrow("não pode ser removido");
    expect(repo.softDeleteLocation).not.toHaveBeenCalled();
  });

  it("member não remove local", async () => {
    await expect(makeService().removeLocation(MEMBER, "cl-1", "lo-1")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("adiciona local do cliente da empresa", async () => {
    const repo = makeRepo();
    await makeService(repo).addLocation(MEMBER, "cl-1", LOCATION_INPUT);
    expect(repo.insertLocation).toHaveBeenCalledWith("co-1", "cl-1", LOCATION_INPUT);
  });
});

describe("validação dos formulários", () => {
  function form(values: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  it("aceita CPF e CNPJ e recusa documento incompleto", () => {
    expect(parseClientForm(form({ name: "Ana Lima", document: "123.456.789-09" })).document).toBe("123.456.789-09");
    expect(parseClientForm(form({ name: "Hotel", document: "" })).document).toBeNull();
    expect(() => parseClientForm(form({ name: "Hotel", document: "123" }))).toThrow();
  });

  it("recusa e-mail inválido e nome vazio no contato", () => {
    expect(() => parseContactForm(form({ name: "Ana", email: "x" }))).toThrow();
    expect(() => parseContactForm(form({ name: "" }))).toThrow();
    expect(parseContactForm(form({ name: "Ana", isPrimary: "on" })).isPrimary).toBe(true);
  });
});

describe("importação de clientes", () => {
  const row = (name: string, document: string | null = null) => ({ name, document, notes: null, contact: null, location: null });

  it("pula quem já está cadastrado e grava o resto de uma vez", async () => {
    const repo = makeRepo();
    const result = await makeService(repo).importMany(OWNER, [row("Padaria"), row("Hotel com outro nome", "11.444.777/0001-61"), row("Mercado")]);
    expect(result).toEqual({ imported: 2, skipped: 1 });
    expect(repo.importMany).toHaveBeenCalledWith("co-1", [row("Padaria"), row("Mercado")]);
  });

  it("respeita o limite de clientes do plano e confere cada linha de novo", async () => {
    const repo = makeRepo();
    await expect(makeService(repo, 2).importMany(OWNER, [row("Padaria"), row("Mercado")])).rejects.toMatchObject({ code: "conflict" });
    await expect(makeService(repo).importMany(OWNER, [row("A")])).rejects.toThrow();
    await expect(makeService(repo).importMany(TECHNICIAN, [row("Padaria")])).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.importMany).not.toHaveBeenCalled();
  });
});
