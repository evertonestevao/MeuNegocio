import { describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/adapters/email/EmailProvider";
import { brand } from "@/config/brand";
import { createTrialEndingService, trialEndingEmail, type TrialEndingNotice } from "./trialEndingService";

const APP = "https://app.exemplo.com.br/";

function notice(overrides: Partial<TrialEndingNotice> = {}): TrialEndingNotice {
  return { subscriptionId: "s1", companyId: "c1", ownerEmail: "maria@exemplo.com", ownerName: "Maria da Silva", trialEndsOn: "2026-11-24", ...overrides };
}

function setup(notices: TrialEndingNotice[], sendFails: (message: EmailMessage) => boolean = () => false) {
  const sent: EmailMessage[] = [];
  const repo = { listPending: vi.fn(async () => notices), markNotified: vi.fn(async () => undefined) };
  const provider = {
    name: "teste",
    send: vi.fn(async (message: EmailMessage) => {
      if (sendFails(message)) throw new Error("falhou");
      sent.push(message);
    }),
  };
  return { repo, provider, sent, service: createTrialEndingService({ repo, provider, appUrl: APP }) };
}

describe("e-mail do fim do teste", () => {
  it("diz o dia em que o teste termina, incentiva a continuar e leva ao login", () => {
    const email = trialEndingEmail(notice(), APP);
    expect(email.subject).toBe(`Seu teste grátis do ${brand.name} acaba em 2 dias`);
    for (const body of [email.text!, email.html]) {
      expect(body).toContain("Olá, Maria!");
      expect(body).toContain(`gostando do ${brand.name}`);
      expect(body).toContain("24/11/2026");
      expect(body).toContain("daqui a 2 dias");
      expect(body).toContain("É só seguir usando.");
      expect(body).toContain("https://app.exemplo.com.br/login");
    }
    expect(email.html).toContain(`Entrar no ${brand.name}`);
  });

  it("o remetente é de não responder: o e-mail não convida a responder", () => {
    const { html, text } = trialEndingEmail(notice(), APP);
    expect(`${html} ${text}`).not.toMatch(/respond/i);
  });

  it("não traz botão de cancelar nem fala de cobrança", () => {
    const { html, text } = trialEndingEmail(notice(), APP);
    expect(`${html} ${text}`).not.toMatch(/cancel|cobran|R\$/i);
  });

  it("sem nome, a saudação fica sem ele; o nome nunca entra como HTML", () => {
    expect(trialEndingEmail(notice({ ownerName: null }), APP).text).toContain("Olá!");
    expect(trialEndingEmail(notice({ ownerName: "   " }), APP).text).toContain("Olá!");
    const html = trialEndingEmail(notice({ ownerName: "<script>alert(1)</script> Ana" }), APP).html;
    expect(html).not.toContain("<script>");
  });
});

describe("envio do aviso", () => {
  it("envia para o proprietário e marca a assinatura", async () => {
    const { service, repo, sent } = setup([notice()]);
    expect(await service.run()).toEqual({ subscriptions: 1, sent: 1, failed: 0, unmarked: 0 });
    expect(repo.listPending).toHaveBeenCalledWith(2);
    expect(sent[0]).toMatchObject({ to: "maria@exemplo.com" });
    expect(repo.markNotified).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("sem teste acabando, não envia nada", async () => {
    const { service, provider, repo } = setup([]);
    expect(await service.run()).toEqual({ subscriptions: 0, sent: 0, failed: 0, unmarked: 0 });
    expect(provider.send).not.toHaveBeenCalled();
    expect(repo.markNotified).not.toHaveBeenCalled();
  });

  it("um e-mail por proprietário, sem repetir o mesmo endereço, e marca a assinatura uma vez", async () => {
    const { service, repo, sent } = setup([
      notice({ ownerEmail: "maria@exemplo.com" }),
      notice({ ownerEmail: "MARIA@exemplo.com" }),
      notice({ ownerEmail: "joao@exemplo.com", ownerName: "João" }),
    ]);
    expect(await service.run()).toMatchObject({ subscriptions: 1, sent: 2 });
    expect(sent.map((message) => message.to).sort()).toEqual(["joao@exemplo.com", "maria@exemplo.com"]);
    expect(repo.markNotified).toHaveBeenCalledTimes(1);
  });

  it("falha no envio: não marca, para tentar de novo, e não impede as outras assinaturas", async () => {
    const { service, repo, sent } = setup(
      [notice({ subscriptionId: "s1", ownerEmail: "falha@exemplo.com" }), notice({ subscriptionId: "s2", ownerEmail: "ok@exemplo.com" })],
      (message) => message.to === "falha@exemplo.com",
    );
    expect(await service.run()).toEqual({ subscriptions: 2, sent: 1, failed: 1, unmarked: 0 });
    expect(sent.map((message) => message.to)).toEqual(["ok@exemplo.com"]);
    expect(repo.markNotified).toHaveBeenCalledExactlyOnceWith("s2");
  });

  it("se um dos proprietários recebeu, a assinatura conta como avisada", async () => {
    const { service, repo } = setup([notice({ ownerEmail: "falha@exemplo.com" }), notice({ ownerEmail: "ok@exemplo.com" })], (message) => message.to === "falha@exemplo.com");
    expect(await service.run()).toMatchObject({ sent: 1, failed: 0 });
    expect(repo.markNotified).toHaveBeenCalledTimes(1);
  });

  it("falha ao marcar não derruba a rotina: segue para as próximas assinaturas", async () => {
    const { service, repo, sent } = setup([notice({ subscriptionId: "s1" }), notice({ subscriptionId: "s2", ownerEmail: "outro@exemplo.com" })]);
    repo.markNotified.mockRejectedValueOnce(new Error("banco fora"));
    expect(await service.run()).toEqual({ subscriptions: 2, sent: 2, failed: 0, unmarked: 1 });
    expect(sent).toHaveLength(2);
  });
});
