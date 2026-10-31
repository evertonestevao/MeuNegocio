import { formatCents } from "@/lib/money";
import { formatDate, formatQuantity, formatTimestamp } from "@/lib/dates";
import type { QuoteDocument } from "@/types/quotes";
import { formatQuoteNumber } from "./status";

function itemDetail(item: QuoteDocument["items"][number]): string {
  if (item.pricingMode === "hourly") {
    const people = item.people === 1 ? "1 pessoa" : `${item.people} pessoas`;
    return `${formatQuantity(item.quantity)} h × ${people} × ${formatCents(item.unitPriceCents)}/h`;
  }
  return `${formatQuantity(item.quantity)} ${item.unit} × ${formatCents(item.unitPriceCents)}`;
}

export { itemDetail as quoteItemDetail };

/** Gera o PDF no navegador. As bibliotecas só carregam quando alguém pede o arquivo. */
export async function downloadQuotePdf(quote: QuoteDocument): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const number = formatQuoteNumber(quote.number);
  const margin = 16;
  let y = 20;

  pdf.setFont("helvetica", "bold").setFontSize(15).text(quote.company.name, margin, y);
  pdf.setFontSize(13).text(`Orçamento Nº ${number}`, width - margin, y, { align: "right" });
  y += 6;

  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  const companyLines = [
    quote.company.cnpj ? `CNPJ ${quote.company.cnpj}` : null,
    quote.company.address,
    [quote.company.phone, quote.company.email].filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => Boolean(line));
  const dateLines = [
    `Emitido em ${formatTimestamp(quote.createdAt)}`,
    quote.validUntil ? `Válido até ${formatDate(quote.validUntil)}` : null,
  ].filter((line): line is string => Boolean(line));
  pdf.text(companyLines, margin, y);
  pdf.text(dateLines, width - margin, y, { align: "right" });
  y += Math.max(companyLines.length, dateLines.length) * 4.2 + 5;

  pdf.setDrawColor(210).line(margin, y, width - margin, y);
  y += 7;

  pdf.setTextColor(20).setFont("helvetica", "bold").setFontSize(10).text("Para", margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  const clientLines = [
    quote.client ? [quote.client.name, quote.client.document].filter(Boolean).join(" · ") : null,
    quote.location ? `${quote.location.name} — ${quote.location.address}` : null,
  ].filter((line): line is string => Boolean(line));
  for (const line of clientLines) {
    const wrapped = pdf.splitTextToSize(line, width - margin * 2);
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 4.6;
  }
  y += 3;

  if (quote.title) {
    pdf.setFont("helvetica", "bold").setFontSize(11);
    const wrapped = pdf.splitTextToSize(quote.title, width - margin * 2);
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 5 + 2;
  }

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 20 },
    head: [["Item", "Quantidade", "Total"]],
    body: quote.items.map((item) => [item.description, itemDetail(item), formatCents(item.lineTotalCents)]),
    styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak" },
    headStyles: { fillColor: [20, 32, 46], textColor: 255 },
    columnStyles: { 1: { cellWidth: 58 }, 2: { cellWidth: 30, halign: "right" } },
  });

  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  const addRow = (label: string, value: string, bold = false) => {
    if (y > height - 24) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 12 : 10);
    pdf.text(label, width - margin - 45, y);
    pdf.text(value, width - margin, y, { align: "right" });
    y += bold ? 7 : 5.5;
  };
  if (quote.discountCents > 0) {
    addRow("Subtotal", formatCents(quote.subtotalCents));
    addRow("Desconto", `- ${formatCents(quote.discountCents)}`);
  }
  addRow("Total", formatCents(quote.totalCents), true);

  if (quote.notes) {
    y += 4;
    const wrapped: string[] = pdf.splitTextToSize(quote.notes, width - margin * 2);
    if (y + wrapped.length * 4.4 + 6 > height - 16) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", "bold").setFontSize(10).text("Observações e condições", margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal").setFontSize(9.5).text(wrapped, margin, y);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    pdf.text(`${quote.company.name} — Orçamento Nº ${number}`, margin, height - 8);
    pdf.text(`Página ${page} de ${pages}`, width - margin, height - 8, { align: "right" });
  }
  pdf.save(`orcamento-${number}.pdf`);
}

/** Texto de envio: a mesma mensagem no WhatsApp e no "Copiar texto". */
export function quoteShareText(quote: QuoteDocument, contactName: string | null, publicUrl: string | null): string {
  const greeting = contactName ? `Olá, ${contactName.split(" ")[0]}!` : "Olá!";
  return [
    `${greeting} Segue o orçamento Nº ${formatQuoteNumber(quote.number)} da ${quote.company.name}.`,
    quote.title ? `Serviço: ${quote.title}` : null,
    `Valor total: ${formatCents(quote.totalCents)}`,
    quote.validUntil ? `Válido até ${formatDate(quote.validUntil)}.` : null,
    publicUrl ? `Veja os detalhes e aprove por aqui: ${publicUrl}` : null,
    "Qualquer dúvida, estou à disposição.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Link wa.me. Telefone brasileiro sem DDI ganha o 55; sem telefone, a pessoa escolhe o contato. */
export function whatsappUrl(phone: string | null, text: string): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const target = digits.length >= 10 && digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}
