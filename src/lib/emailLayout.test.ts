import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { emailParagraph, renderEmailLayout } from "./emailLayout";

const BASE = { appUrl: "https://www.exemplo.com.br/", title: "Título", bodyHtml: emailParagraph("Corpo") };

describe("layout dos e-mails", () => {
  it("traz o logo do próprio app, o nome do produto e o contato de suporte", () => {
    const html = renderEmailLayout(BASE);
    expect(html).toContain('src="https://www.exemplo.com.br/icons/icon-192.png"');
    expect(html).toContain(brand.name);
    expect(html).toContain(`mailto:${brand.legal.supportEmail}`);
    expect(html).toContain("<h1");
  });

  it("o botão leva ao endereço e o mesmo endereço aparece em texto para quem não consegue clicar", () => {
    const html = renderEmailLayout({ ...BASE, button: { label: "Abrir", url: "https://app/x?a=1&b=2" } });
    expect(html).toContain('href="https://app/x?a=1&amp;b=2"');
    expect(html.match(/https:\/\/app\/x\?a=1&amp;b=2/g)).toHaveLength(3);
    expect(html).toContain("Se o botão não abrir");
  });

  it("sem botão, não mostra o aviso do botão", () => {
    expect(renderEmailLayout(BASE)).not.toContain("Se o botão não abrir");
  });

  it("título, prévia, texto do botão e nota não viram HTML", () => {
    const html = renderEmailLayout({
      ...BASE,
      title: "<script>x</script>",
      preheader: "<b>p</b>",
      button: { label: "<i>b</i>", url: "https://app" },
      footnote: "<u>n</u>",
    });
    for (const raw of ["<script>x</script>", "<b>p</b>", "<i>b</i>", "<u>n</u>"]) expect(html).not.toContain(raw);
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("o corpo entra como veio: quem chama é quem escapa", () => {
    expect(renderEmailLayout({ ...BASE, bodyHtml: emailParagraph("<strong>ok</strong>") })).toContain("<strong>ok</strong>");
  });
});
