import { describe, expect, it } from "vitest";
import type { Profile } from "@/types/database";
import { createUserService, type UserRepository } from "./userService";

function makeRepo(updates: Array<Record<string, unknown>>): UserRepository {
  return {
    async getMyProfile() {
      return null as Profile | null;
    },
    async updateMyProfile(data) {
      updates.push(data);
    },
  };
}

describe("userService.updateMyProfile", () => {
  it("grava só o nome, sem espaços nas pontas", async () => {
    const updates: Array<Record<string, unknown>> = [];
    await createUserService(makeRepo(updates)).updateMyProfile({ fullName: "  Ana Lima " });
    expect(updates).toEqual([{ full_name: "Ana Lima" }]);
  });

  it("recusa nome curto demais ou que não é texto", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const service = createUserService(makeRepo(updates));
    await expect(service.updateMyProfile({ fullName: "A" })).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.updateMyProfile({ fullName: 123 })).rejects.toMatchObject({ code: "validation_error" });
    expect(updates).toEqual([]);
  });
});
