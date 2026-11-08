import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

afterEach(() => vi.unstubAllEnvs());

describe("trava do gateway fake em produção (P-01)", () => {
  const stub = (vars: Record<string, string>) => {
    for (const [k, v] of Object.entries({ ...base, ...vars })) vi.stubEnv(k, v);
  };

  it("recusa PAYMENT_GATEWAY=fake quando APP_ENV=production", () => {
    stub({ APP_ENV: "production", PAYMENT_GATEWAY: "fake" });
    expect(() => getServerEnv()).toThrow(/fake.*não.*permitido.*produção/i);
  });

  it("aceita fake fora de produção", () => {
    stub({ APP_ENV: "development", PAYMENT_GATEWAY: "fake" });
    expect(getServerEnv().PAYMENT_GATEWAY).toBe("fake");
  });

  it("aceita um gateway real em produção", () => {
    stub({ APP_ENV: "production", PAYMENT_GATEWAY: "asaas" });
    expect(getServerEnv().PAYMENT_GATEWAY).toBe("asaas");
  });
});
