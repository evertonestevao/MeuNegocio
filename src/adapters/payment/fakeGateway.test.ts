import { describe, expect, it } from "vitest";
import { createFakeGateway } from "./fakeGateway";

const event = { type: "ignored", gateway: "fake" };
const webhook = (secret: string | null) => ({
  payload: JSON.stringify(event),
  headers: new Headers(secret === null ? {} : { "x-webhook-signature": secret }),
});

describe("fakeGateway webhook", () => {
  it("aceita o segredo histórico quando nada é configurado", async () => {
    const gateway = createFakeGateway();
    await expect(gateway.handleWebhook(webhook("fake-signature"))).resolves.toMatchObject({ type: "ignored" });
  });

  it("recusa sem o header e com header errado", async () => {
    const gateway = createFakeGateway();
    await expect(gateway.handleWebhook(webhook(null))).rejects.toMatchObject({ code: "payment_error" });
    await expect(gateway.handleWebhook(webhook("errado"))).rejects.toMatchObject({ code: "payment_error" });
  });

  it("honra um segredo configurado e recusa o antigo", async () => {
    const gateway = createFakeGateway({ webhookSecret: "s3gr3do" });
    await expect(gateway.handleWebhook(webhook("s3gr3do"))).resolves.toMatchObject({ type: "ignored" });
    await expect(gateway.handleWebhook(webhook("fake-signature"))).rejects.toMatchObject({ code: "payment_error" });
  });
});
