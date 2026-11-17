import { describe, expect, it, vi } from "vitest";
import { createAuthService, type AuthRepository } from "./authService";

function makeDeps(overrides: Partial<AuthRepository> = {}) {
  const repo = {
    signUp: vi.fn(async () => undefined),
    signInWithPassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    createRecoveryToken: vi.fn(async () => "hash-123" as string | null),
    updatePassword: vi.fn(async () => undefined),
    ...overrides,
  } satisfies AuthRepository;
  const rateLimiter = { consume: vi.fn(async () => undefined) };
  const emailProvider = { name: "teste", send: vi.fn(async () => undefined) };
  const service = createAuthService({ repo, rateLimiter, appUrl: "https://www.exemplo.com.br/", emailProvider });
  return { repo, rateLimiter, emailProvider, service };
}

describe("recuperação de senha", () => {
  it("envia o e-mail com o link montado pelo endereço do app, não pelo do Supabase", async () => {
    const { service, emailProvider } = makeDeps();
    await service.requestPasswordReset({ email: "Ana@Exemplo.com" });
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    const message = (emailProvider.send.mock.calls[0] as unknown as [{ to: string; subject: string; html: string; text: string }])[0];
    expect(message.to).toBe("Ana@Exemplo.com");
    const link = "https://www.exemplo.com.br/auth/confirm?token_hash=hash-123&type=recovery&next=/reset-password";
    expect(message.text).toContain(link);
    expect(message.html).toContain("token_hash=hash-123");
    expect(message.html).not.toContain("localhost");
  });

  it("conta inexistente: responde igual e não envia nada", async () => {
    const { service, emailProvider } = makeDeps({ createRecoveryToken: vi.fn(async () => null) });
    await expect(service.requestPasswordReset({ email: "quem@exemplo.com" })).resolves.toBeUndefined();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it("falha do envio não revela nada a quem pediu", async () => {
    const { service, emailProvider } = makeDeps();
    emailProvider.send.mockRejectedValueOnce(new Error("caixa cheia"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(service.requestPasswordReset({ email: "ana@exemplo.com" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("limita as tentativas por e-mail, antes de gerar o código", async () => {
    const { service, rateLimiter, repo } = makeDeps();
    rateLimiter.consume.mockRejectedValueOnce(new Error("muitas tentativas"));
    await expect(service.requestPasswordReset({ email: "ana@exemplo.com" })).rejects.toThrow("muitas tentativas");
    expect(rateLimiter.consume).toHaveBeenCalledWith("password-reset:ana@exemplo.com");
    expect(repo.createRecoveryToken).not.toHaveBeenCalled();
  });

  it("e-mail inválido é recusado sem gerar código nem enviar", async () => {
    const { service, repo, emailProvider } = makeDeps();
    await expect(service.requestPasswordReset({ email: "nao-e-email" })).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.createRecoveryToken).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });
});
