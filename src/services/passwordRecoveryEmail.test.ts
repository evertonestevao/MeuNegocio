import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { passwordRecoveryEmail } from "./passwordRecoveryEmail";

describe("e-mail de recuperação de senha", () => {
  const LINK = "https://www.exemplo.com.br/auth/confirm?token_hash=abc&type=recovery&next=/reset-password";
  const email = passwordRecoveryEmail(LINK, "https://www.exemplo.com.br");

  it("assunto com o nome do produto e o link no botão e no texto", () => {
    expect(email.subject).toBe(`Redefinir sua senha do ${brand.name}`);
    expect(email.html).toContain('href="https://www.exemplo.com.br/auth/confirm?token_hash=abc&amp;type=recovery&amp;next=/reset-password"');
    expect(email.text).toContain(LINK);
  });

  it("tem o logo e avisa que quem não pediu pode ignorar", () => {
    expect(email.html).toContain("/icons/icon-192.png");
    expect(email.html).toContain("Se você não pediu isso, ignore este e-mail");
    expect(email.text).toContain("Se você não pediu isso, ignore este e-mail");
  });

  it("não aponta para localhost", () => {
    expect(email.html).not.toContain("localhost");
  });
});
