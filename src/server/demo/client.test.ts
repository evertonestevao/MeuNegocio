import { describe, expect, it, vi } from "vitest";
import { DEMO_READ_ONLY_CODE } from "@/config/demo";
import { createDemoClient, demoDayOffset, shiftDates, shiftToCurrentMonth } from "./client";

describe("client da demonstração", () => {
  const client = createDemoClient("owner");

  it("recusa toda escrita sem fazer requisição", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const attempts = [
      client.from("clients").insert({ name: "x" }).select("*").single(),
      client.from("clients").update({ name: "x" }).eq("id", "1"),
      client.from("clients").upsert({ name: "x" }),
      client.from("clients").delete().eq("id", "1"),
      client.rpc("save_quote", {}),
      client.rpc("complete_work_order", {}),
    ];
    for (const attempt of attempts) {
      expect((await attempt).error?.code).toBe(DEMO_READ_ONLY_CODE);
    }
    expect((await client.storage.from("work-orders").upload("a", new Blob())).error).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("lê com filtros, contagem, ordem e relações", async () => {
    const { data, count } = await client.from("clients").select("*, contacts:client_contacts(name)", { count: "exact" }).order("name").range(0, 1);
    expect(count).toBe(4);
    expect(data).toHaveLength(2);
    expect(data![0].contacts[0].name).toBeTruthy();
    const { data: found } = await client.from("clients").select("*").or('name.ilike."%padaria%",document.ilike."%padaria%"');
    expect(found!.map((row) => row.name)).toEqual(["Padaria Pão Dourado"]);
    const { count: active } = await client.from("quotes").select("id", { count: "exact", head: true }).eq("status", "closed");
    expect(active).toBeGreaterThan(0);
    const { data: none } = await client.from("clients").select("*").eq("id", "nao-existe").maybeSingle();
    expect(none).toBeNull();
  });

  it("filtra por coluna que a consulta não devolve", async () => {
    const { data } = await client.from("company_members").select("role, company:companies(*)").eq("user_id", "ninguem");
    expect(data).toEqual([]);
    const { data: mine } = await client.from("company_members").select("role, company:companies(*)");
    expect((mine![0].company as unknown as { name: string }).name).toBe("Refrigeração Exemplo");
  });

  it("o perfil decide o papel", async () => {
    const role = async (profile: "owner" | "technician") => {
      const { data } = await createDemoClient(profile).from("company_members").select("role").limit(1).maybeSingle();
      return data!.role;
    };
    expect(await role("owner")).toBe("owner");
    expect(await role("technician")).toBe("technician");
  });

  it("não informa nada de plataforma nem de revenda", async () => {
    expect((await client.rpc("is_super_admin")).data).toBe(false);
    expect((await client.rpc("resellers_enabled")).data).toBe(false);
  });

  it("orçamento aprovado no link traz a resposta com assinatura; enviado, não", async () => {
    const approved = (await client.rpc("get_public_quote", { p_token: "demonstracao-0002" })).data;
    expect(approved.status).toBe("approved");
    expect(approved.response).toMatchObject({ decision: "approved", signature_path: "/exemplos/assinatura-cliente.png" });
    expect((await client.rpc("get_public_quote", { p_token: "demonstracao-0004" })).data.response).toBeNull();
  });

    it("calcula o imposto pelo faturamento dos 12 meses anteriores", async () => {
    const { data, error } = await client.rpc("get_company_tax", { p_company_id: "demo" });
    expect(error).toBeNull();
    expect(data.months).toHaveLength(12);
    expect(data.auto).toBe(true);
    expect(data.detail.rbt12_cents).toBe(data.months.reduce((sum: number, month: { launched_cents: number; informed_cents: number | null }) => sum + (month.informed_cents ?? month.launched_cents), 0));
    expect(data.rate_bps).toBe(data.detail.rate_bps);
    expect(data.rate_bps).toBeGreaterThan(0);
  });
});

describe("datas da demonstração", () => {
  it("anda junto com o calendário", () => {
    expect(demoDayOffset(new Date("2026-10-31T15:00:00Z"))).toBe(0);
    expect(demoDayOffset(new Date("2026-11-10T15:00:00Z"))).toBe(10);
  });

  it("muda datas e preserva o resto", () => {
    expect(shiftDates({ a: "2026-10-31", b: ["2026-10-01T10:00:00.000Z"], c: "Rua 2026", d: 5 }, 2)).toEqual({
      a: "2026-11-02",
      b: ["2026-10-03T10:00:00.000Z"],
      c: "Rua 2026",
      d: 5,
    });
  });

  it("valores por mês acompanham o mês atual, sem passar de hoje", () => {
    expect(shiftToCurrentMonth("2026-10-12", "2026-10-31")).toBe("2026-10-12");
    expect(shiftToCurrentMonth("2026-10-12", "2026-11-01")).toBe("2026-11-01");
    expect(shiftToCurrentMonth("2026-10-12", "2026-11-20")).toBe("2026-11-12");
    expect(shiftToCurrentMonth("2026-09-22", "2026-11-01")).toBe("2026-10-22");
    expect(shiftToCurrentMonth("2026-08-31", "2027-03-15")).toBe("2027-01-31");
    expect(shiftToCurrentMonth("2026-08-31", "2026-11-15")).toBe("2026-09-30");
  });
});
