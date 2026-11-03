import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { admin, makeSuperAdmin } from "./reseller-helpers";

test("texto livre do plano sai do painel para a assinatura, sem prazo de auditoria", async ({ page }) => {
  const { data: plan, error } = await admin.from("plans").select("id, custom_text").eq("code", "pro").single();
  if (error || !plan) throw error ?? new Error("Plano pro não encontrado");
  const text = `Teste grátis por 7 dias ${Date.now()}`;

  try {
    const email = uniqueEmail("planos");
    await signupAndOnboard(page, { email, password: PASSWORD, name: "Dono Planos", company: "Empresa Planos E2E" });
    await makeSuperAdmin(email);

    await page.goto("/admin/planos");
    const field = page.locator(`[id="${plan.id}-custom-text"]`);
    await field.fill(text);
    await page.locator("form", { has: field }).getByRole("button", { name: "Salvar plano" }).click();
    await expect(page.getByText("Plano salvo")).toBeVisible();

    await page.goto("/dashboard/billing");
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText("Dias de auditoria")).toHaveCount(0);
  } finally {
    await admin.from("plans").update({ custom_text: plan.custom_text }).eq("id", plan.id);
  }
});
