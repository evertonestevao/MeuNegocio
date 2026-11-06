import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/server/actor";
import { MAX_LOGO_BYTES } from "@/features/company/logo";
import { createCompanyLogoService, type CompanyLogoFiles, type CompanyLogoRepository } from "./companyLogoService";

const OWNER: ActorContext = { companyId: "empresa-1", role: "owner" };
const MEMBER: ActorContext = { ...OWNER, role: "member" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);

function setup({ current = null as string | null, repo: repoOverrides = {} as Partial<CompanyLogoRepository>, files: fileOverrides = {} as Partial<CompanyLogoFiles> } = {}) {
  const repo = { getLogoPath: vi.fn(async () => current), setLogoPath: vi.fn(async () => {}), ...repoOverrides };
  const files = { upload: vi.fn(async () => {}), remove: vi.fn(async () => {}), ...fileOverrides };
  return { repo, files, service: createCompanyLogoService({ repo, files, newId: () => "novo-id" }) };
}

describe("logo da empresa", () => {
  it("grava na pasta da empresa, com nome novo, e apaga o anterior", async () => {
    const { repo, files, service } = setup({ current: "empresa-1/antigo.png" });
    expect(await service.upload(OWNER, PNG)).toBe("empresa-1/novo-id.png");
    expect(files.upload).toHaveBeenCalledWith("empresa-1/novo-id.png", PNG, "image/png");
    expect(repo.setLogoPath).toHaveBeenCalledWith("empresa-1", "empresa-1/novo-id.png");
    expect(files.remove).toHaveBeenCalledWith("empresa-1/antigo.png");
  });

  it("só o proprietário e o administrador trocam o logo", async () => {
    const { files, service } = setup();
    await expect(service.upload(MEMBER, PNG)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.remove(MEMBER)).rejects.toMatchObject({ code: "forbidden" });
    expect(files.upload).not.toHaveBeenCalled();
  });

  it("aceita só PNG (o aparelho converte) e até 500 KB", async () => {
    const { files, service } = setup();
    await expect(service.upload(OWNER, JPEG)).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.upload(OWNER, new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toMatchObject({ code: "validation_error" });
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(PNG);
    await expect(service.upload(OWNER, big)).rejects.toThrow("até 500 KB");
    await expect(service.upload(OWNER, new Uint8Array())).rejects.toMatchObject({ code: "validation_error" });
    expect(files.upload).not.toHaveBeenCalled();
  });

  it("falha ao gravar no banco não deixa o arquivo novo para trás nem apaga o antigo", async () => {
    const { files, service } = setup({ current: "empresa-1/antigo.png", repo: { setLogoPath: vi.fn().mockRejectedValue(new Error("falhou")) } });
    await expect(service.upload(OWNER, PNG)).rejects.toThrow("falhou");
    expect(files.remove).toHaveBeenCalledTimes(1);
    expect(files.remove).toHaveBeenCalledWith("empresa-1/novo-id.png");
  });

  it("remover limpa o caminho e apaga o arquivo; sem logo, não faz nada", async () => {
    const withLogo = setup({ current: "empresa-1/antigo.png" });
    await withLogo.service.remove(OWNER);
    expect(withLogo.repo.setLogoPath).toHaveBeenCalledWith("empresa-1", null);
    expect(withLogo.files.remove).toHaveBeenCalledWith("empresa-1/antigo.png");

    const without = setup();
    await without.service.remove(OWNER);
    expect(without.repo.setLogoPath).not.toHaveBeenCalled();
  });
});
