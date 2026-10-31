import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { createClient, createEmployee, dateFromToday, fillVisit, setupProCompany } from "./business-helpers";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

/** PNG simples, gerado aqui para o teste não depender de arquivo no repositório. */
function samplePng(size = 64): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 128)]);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** O técnico vê só o que é dele, conclui a OS com assinatura, e o escritório recebe as horas. */
test("técnico conclui a ordem de serviço e as horas chegam ao escritório", async ({ browser, page: owner }) => {
  // Duas sessões e o fluxo inteiro de campo: bem mais longo que os demais em next dev.
  test.setTimeout(240_000);
  await setupProCompany(owner, "Empresa Campo E2E");
  await createClient(owner, "Cliente Campo E2E", "Obra");

  const technicianEmail = uniqueEmail("tecnico");
  const technicianContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const technician = await technicianContext.newPage();
  await signupAndOnboard(technician, {
    email: technicianEmail,
    password: PASSWORD,
    name: "Carlos Técnico",
    company: "Empresa Própria Técnico E2E",
  });

  await owner.goto("/dashboard/members");
  await owner.getByLabel("E-mail").fill(technicianEmail);
  await owner.getByLabel("Papel").selectOption("technician");
  await owner.getByRole("button", { name: "Enviar convite" }).click();
  await expect(owner.getByText("Convite enviado")).toBeVisible();

  await technician.goto("/dashboard/settings");
  await technician.getByRole("button", { name: /Aceitar/ }).click();
  await expect(technician.getByRole("button", { name: /Aceitar/ })).toBeHidden();
  await technician.getByRole("button", { name: /Empresa Própria Técnico E2E/ }).click();
  await technician.getByRole("menuitem", { name: /Empresa Campo E2E/ }).click();
  await expect(technician).toHaveURL(/./);
  await expect(technician.getByRole("button", { name: /Empresa Campo E2E/ })).toBeVisible();

  await createEmployee(owner, "Carlos Equipe", "clt");
  await owner.getByRole("button", { name: "Editar Carlos Equipe" }).click();
  await owner.getByRole("dialog").getByLabel("Usuário vinculado").selectOption({ label: "Carlos Técnico" });
  await owner.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(owner.getByRole("dialog")).toBeHidden();

  const today = dateFromToday(0);
  const dialog = await fillVisit(owner, { client: "Cliente Campo E2E", location: "Obra", date: today, start: "01:00", end: "02:00", people: ["Carlos Equipe"] });
  await dialog.getByRole("button", { name: "Salvar visita" }).click();
  await expect(dialog).toBeHidden();

  // O técnico cai nas próprias visitas e não entra no escritório.
  await technician.goto("/dashboard");
  await expect(technician).toHaveURL(/\/dashboard\/my-visits/);
  await technician.goto("/dashboard/clients");
  await expect(technician).toHaveURL(/\/dashboard\/my-visits/);

  await technician.getByRole("link", { name: /Cliente Campo E2E/ }).click();
  await technician.getByRole("button", { name: /Cheguei/ }).click();
  await expect(technician.getByText("Conferir local e acesso")).toBeVisible();
  await technician.getByRole("checkbox", { name: "Conferir local e acesso" }).check();

  await technician.getByLabel("Legenda da próxima foto (opcional)").fill("Antes do serviço");
  await technician.locator("#photo-file").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: samplePng() });
  await expect(technician.getByText("Antes do serviço", { exact: true })).toBeVisible();

  await technician.getByLabel("O que foi feito").fill("Serviço concluído.");
  await technician.getByLabel("Início real").fill("08:00");
  await technician.getByLabel("Fim real").fill("10:00");
  await technician.getByLabel("Nome de quem assinou").fill("Renato Cliente");

  await technician.getByRole("button", { name: "Concluir ordem de serviço" }).click();
  await expect(technician.getByText("Peça a assinatura do cliente.")).toBeVisible();

  const pad = technician.getByLabel("Assinatura do cliente");
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error("quadro de assinatura fora da tela");
  await technician.mouse.move(box.x + 30, box.y + 40);
  await technician.mouse.down();
  await technician.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
  await technician.mouse.move(box.x + 220, box.y + 50, { steps: 6 });
  await technician.mouse.up();
  await technician.getByRole("button", { name: "Concluir ordem de serviço" }).click();
  await expect(technician.getByRole("button", { name: "Baixar PDF" })).toBeVisible();
  await expect(technician.getByRole("button", { name: "Concluir ordem de serviço" })).toBeHidden();

  // O escritório lê a OS, sem poder alterar, e recebe o apontamento pendente com os horários reais.
  const visitUrl = new URL(technician.url()).pathname;
  await owner.goto(visitUrl);
  await expect(owner.getByText("Renato Cliente")).toBeVisible();
  await expect(owner.getByRole("button", { name: "Concluir ordem de serviço" })).toBeHidden();
  await expect(owner.getByRole("img", { name: "Antes do serviço" })).toBeVisible();

  await owner.goto(`/dashboard/hours?m=${today.slice(0, 7)}&clt=1`);
  await owner.locator("main a", { hasText: "Carlos Equipe" }).click();
  await expect(owner.getByText("08:00–10:00")).toBeVisible();
  await expect(owner.getByText("Pendente")).toBeVisible();

  await technicianContext.close();
});
