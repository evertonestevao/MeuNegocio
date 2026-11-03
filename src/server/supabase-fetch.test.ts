import { describe, expect, it, vi } from "vitest";
import { createClockTolerantFetch } from "./supabase-fetch";

const clockError = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
const expired = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), { status: 401 });
const ok = () => new Response("[]", { status: 200 });

describe("createClockTolerantFetch", () => {
  it("repete quando o token é recusado por estar no futuro", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(clockError()).mockResolvedValueOnce(ok());
    const response = await createClockTolerantFetch(base, [0, 0])("http://x", { method: "POST", body: "{}" });
    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base).toHaveBeenLastCalledWith("http://x", { method: "POST", body: "{}" });
  });

  it("desiste depois das tentativas e devolve o erro", async () => {
    const base = vi.fn<typeof fetch>().mockImplementation(async () => clockError());
    const response = await createClockTolerantFetch(base, [0, 0])("http://x");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "PGRST303" });
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("não repete token expirado nem outras respostas", async () => {
    for (const make of [expired, ok, () => new Response("nao json", { status: 401 })]) {
      const base = vi.fn<typeof fetch>().mockImplementation(async () => make());
      await createClockTolerantFetch(base, [0, 0])("http://x");
      expect(base).toHaveBeenCalledTimes(1);
    }
  });
});
