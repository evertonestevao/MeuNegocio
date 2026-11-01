import { describe, expect, it, vi } from "vitest";
import { checklistLabelsSchema } from "@/features/work-orders/schemas";
import { createChecklistService } from "./checklistService";

function setup() {
  const repo = {
    list: vi.fn(async () => ({ assessment: ["A"], execution: ["B"] })),
    save: vi.fn(async () => undefined),
  };
  return { repo, service: createChecklistService(repo) };
}

describe("checklistService", () => {
  it("proprietário e administrador salvam o modelo", async () => {
    for (const role of ["owner", "admin"] as const) {
      const { repo, service } = setup();
      await service.save({ companyId: "co", role }, "execution", ["Item"]);
      expect(repo.save).toHaveBeenCalledWith("co", "execution", ["Item"]);
    }
  });

  it("membro e técnico não alteram o modelo", async () => {
    for (const role of ["member", "technician"] as const) {
      const { repo, service } = setup();
      await expect(service.save({ companyId: "co", role }, "execution", ["Item"])).rejects.toMatchObject({ code: "forbidden" });
      expect(repo.save).not.toHaveBeenCalled();
    }
  });
});

describe("checklistLabelsSchema", () => {
  it("tira espaços e linhas em branco", () => {
    expect(checklistLabelsSchema.parse(["  Um ", "", "   ", "Dois"])).toEqual(["Um", "Dois"]);
  });

  it("aceita lista vazia e recusa o que passa dos limites", () => {
    expect(checklistLabelsSchema.parse([])).toEqual([]);
    expect(checklistLabelsSchema.safeParse(Array(31).fill("Item")).success).toBe(false);
    expect(checklistLabelsSchema.safeParse(["x".repeat(121)]).success).toBe(false);
  });
});
