import { describe, expect, it, vi } from "vitest";
import { completeWorkOrderSchema, detectImageType } from "@/features/work-orders/schemas";
import type { ActorContext } from "@/server/actor";
import type { VisitSheet, WorkOrder } from "@/types/workOrders";
import { createWorkOrderService, type WorkOrderRepository } from "./workOrderService";

const ACTOR: ActorContext = { companyId: "co", role: "technician" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);

function sheet(order: Partial<WorkOrder> | null, overrides: Partial<VisitSheet> = {}): VisitSheet {
  return {
    is_mine: true,
    work_order: order ? ({ id: "wo", status: "in_progress", photos: [], ...order } as WorkOrder) : null,
    ...overrides,
  } as VisitSheet;
}

function setup(current: VisitSheet | null = sheet({}), canUse = true) {
  const repo = {
    getSheet: vi.fn(async () => current),
    listMine: vi.fn(async () => []),
    start: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    addPhoto: vi.fn(async () => undefined),
    removePhoto: vi.fn(async () => "co/wo/a.jpg"),
    updatePhotoCaption: vi.fn(async () => undefined),
    addChecklistItem: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
  } satisfies WorkOrderRepository;
  const files = {
    upload: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    createSignedUrl: vi.fn(async (path: string) => `https://signed/${path}`),
  };
  const service = createWorkOrderService({ repo, files, canUseWorkOrders: async () => canUse, newId: () => "id" });
  return { repo, files, service };
}

describe("ordem de serviço", () => {
  it("plano sem o recurso não inicia", async () => {
    const { repo, service } = setup(sheet(null), false);
    await expect(service.start(ACTOR, "v")).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.start).not.toHaveBeenCalled();
  });

  it("guarda a foto na pasta da empresa e da OS", async () => {
    const { repo, files, service } = setup();
    await service.addPhoto(ACTOR, "v", JPEG, "Antes");
    expect(files.upload).toHaveBeenCalledWith("co/wo/id.jpg", JPEG, "image/jpeg");
    expect(repo.addPhoto).toHaveBeenCalledWith("co", "v", "co/wo/id.jpg", "Antes");
  });

  it("recusa arquivo que não é imagem e arquivo grande", async () => {
    const { files, service } = setup();
    await expect(service.addPhoto(ACTOR, "v", new Uint8Array([1, 2, 3, 4]), "")).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.addPhoto(ACTOR, "v", new Uint8Array(901 * 1024).fill(0xff), "")).rejects.toMatchObject({ code: "validation_error" });
    expect(files.upload).not.toHaveBeenCalled();
  });

  it("apaga o arquivo se o registro falhar", async () => {
    const { repo, files, service } = setup();
    repo.addPhoto.mockRejectedValue(new Error("x"));
    await expect(service.addPhoto(ACTOR, "v", JPEG, "")).rejects.toThrow();
    expect(files.remove).toHaveBeenCalledWith("co/wo/id.jpg");
  });

  it("não aceita foto em visita de outra pessoa nem OS concluída", async () => {
    const other = setup(sheet({}, { is_mine: false }));
    await expect(other.service.addPhoto(ACTOR, "v", JPEG, "")).rejects.toMatchObject({ code: "not_found" });
    const done = setup(sheet({ status: "completed" }));
    await expect(done.service.addPhoto(ACTOR, "v", JPEG, "")).rejects.toMatchObject({ code: "conflict" });
    await expect(done.service.complete(ACTOR, "v", { signature: PNG, signatureName: "Ana", finishedTime: "12:00" })).rejects.toMatchObject({ code: "conflict" });
    expect(done.files.upload).not.toHaveBeenCalled();
  });

  it("inclui item no checklist só em OS aberta de quem está escalado", async () => {
    const { service, repo } = setup(sheet({}));
    await service.addChecklistItem(ACTOR, "v", "Trocar lâmpada");
    expect(repo.addChecklistItem).toHaveBeenCalledWith("co", "v", "Trocar lâmpada");
    const other = setup(sheet({}, { is_mine: false }));
    await expect(other.service.addChecklistItem(ACTOR, "v", "x")).rejects.toMatchObject({ code: "not_found" });
    const done = setup(sheet({ status: "completed" }));
    await expect(done.service.addChecklistItem(ACTOR, "v", "x")).rejects.toMatchObject({ code: "conflict" });
    expect(done.repo.addChecklistItem).not.toHaveBeenCalled();
  });

  it("edita a legenda só em OS aberta de quem está escalado", async () => {
    const { service, repo } = setup(sheet({}));
    await service.updatePhotoCaption(ACTOR, "v", "foto", "Depois");
    expect(repo.updatePhotoCaption).toHaveBeenCalledWith("co", "v", "foto", "Depois");
    const other = setup(sheet({}, { is_mine: false }));
    await expect(other.service.updatePhotoCaption(ACTOR, "v", "foto", "x")).rejects.toMatchObject({ code: "not_found" });
    const done = setup(sheet({ status: "completed" }));
    await expect(done.service.updatePhotoCaption(ACTOR, "v", "foto", "x")).rejects.toMatchObject({ code: "conflict" });
    expect(done.repo.updatePhotoCaption).not.toHaveBeenCalled();
  });

  it("exige OS iniciada", async () => {
    const { service } = setup(sheet(null));
    await expect(service.addPhoto(ACTOR, "v", JPEG, "")).rejects.toThrow("Inicie");
  });

  it("conclui guardando a assinatura; se falhar, apaga o arquivo", async () => {
    const { repo, files, service } = setup();
    await service.complete(ACTOR, "v", { signature: PNG, signatureName: "Ana", finishedTime: "12:00" });
    expect(repo.complete).toHaveBeenCalledWith("co", "v", { signaturePath: "co/wo/id.png", signatureName: "Ana", finishedTime: "12:00" });
    repo.complete.mockRejectedValue(new Error("x"));
    await expect(service.complete(ACTOR, "v", { signature: PNG, signatureName: "Ana", finishedTime: "12:00" })).rejects.toThrow();
    expect(files.remove).toHaveBeenCalledWith("co/wo/id.png");
  });

  it("assina links só dos arquivos que existem", async () => {
    const { service } = setup();
    const urls = await service.signFiles(sheet({ photos: [{ id: "p", path: "co/wo/p.jpg", caption: null }] }));
    expect(urls).toEqual({ photos: { p: "https://signed/co/wo/p.jpg" }, signature: null });
    expect(await service.signFiles(sheet(null))).toEqual({ photos: {}, signature: null });
  });
});

describe("validação", () => {
  it("detecta o tipo real", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("RIFFxxxxWEBP"))).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("<script>"))).toBeNull();
  });

  it("concluir exige nome e fim depois do início", () => {
    const valid = { signatureName: "Ana", startedTime: "08:00", finishedTime: "12:00" };
    expect(completeWorkOrderSchema.safeParse(valid).success).toBe(true);
    expect(completeWorkOrderSchema.safeParse({ ...valid, signatureName: "" }).success).toBe(false);
    expect(completeWorkOrderSchema.safeParse({ ...valid, finishedTime: "08:00" }).success).toBe(false);
  });
});
