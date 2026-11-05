import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatTaxRate } from "@/lib/tax";
import { allCostsCents, costsLabel } from "./labels";
import type { ServiceCost } from "@/services/serviceCostService";

export interface ServiceCostPdfInput {
  companyName: string;
  quoteNumber: string;
  title: string | null;
  clientName: string | null;
  statusLabel: string;
  targetMarginPercent: number;
  cost: ServiceCost;
}

type Rgb = [number, number, number];
const NAVY: Rgb = [23, 34, 47];
const AMBER: Rgb = [240, 180, 41];
const INK: Rgb = [31, 41, 55];
const MUTED: Rgb = [100, 112, 128];
const SOFT: Rgb = [244, 246, 249];
const GREEN: Rgb = [14, 122, 74];
const RED: Rgb = [185, 28, 28];
const ORANGE: Rgb = [180, 83, 9];

export function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

/** Relatório de fechamento do serviço, gerado no navegador. Só para quem vê custos. */
export async function downloadServiceCostPdf(input: ServiceCostPdfInput): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { cost } = input;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 15;
  const usable = width - margin * 2;
  const font = (style: "normal" | "bold", size: number, color: Rgb) =>
    pdf.setFont("helvetica", style).setFontSize(size).setTextColor(color[0], color[1], color[2]);

  pdf.setFillColor(...NAVY).rect(0, 0, width, 30, "F");
  pdf.setFillColor(...AMBER).rect(0, 30, width, 1.1, "F");
  font("bold", 15, [255, 255, 255]);
  pdf.text(input.companyName, margin, 13);
  font("normal", 9, [205, 213, 224]);
  pdf.text(`Orçamento Nº ${input.quoteNumber}${input.clientName ? `  ·  ${input.clientName}` : ""}`, margin, 20);
  if (input.title) pdf.text(pdf.splitTextToSize(input.title, usable * 0.62)[0], margin, 25);
  font("bold", 8.5, AMBER);
  pdf.text("RESULTADO DO SERVIÇO", width - margin, 12, { align: "right" });
  font("normal", 9, [205, 213, 224]);
  pdf.text(`Gerado em ${formatDate(new Date().toISOString().slice(0, 10))}  ·  ${input.statusLabel}`, width - margin, 19, { align: "right" });

  let y = 40;
  const cards: Array<[string, string, Rgb]> = [
    ["VALOR COBRADO", formatCents(cost.revenueCents), INK],
    [costsLabel(cost).toUpperCase(), formatCents(allCostsCents(cost)), INK],
    [
      "RESULTADO",
      formatCents(cost.resultCents),
      cost.status === "loss" ? RED : cost.status === "low" ? ORANGE : GREEN,
    ],
  ];
  const cardWidth = (usable - 8) / 3;
  cards.forEach(([label, value, color], index) => {
    const x = margin + index * (cardWidth + 4);
    pdf.setFillColor(...SOFT).roundedRect(x, y, cardWidth, 20, 1.8, 1.8, "F");
    font("bold", 7, MUTED);
    pdf.text(label, x + 4, y + 6);
    font("bold", 13, color);
    pdf.text(value, x + 4, y + 14.5);
  });
  y += 27;
  font("normal", 9.5, INK);
  const marginText = cost.marginPercent === null ? "Sem valor cobrado para calcular a margem." : `Margem de ${cost.marginPercent}% (meta da empresa: ${input.targetMarginPercent}%).`;
  pdf.text(marginText, margin, y);
  y += 5;
  if (cost.plannedCostCents !== null) {
    const difference = cost.totalCostCents - cost.plannedCostCents;
    pdf.text(
      `Custo previsto no orçamento: ${formatCents(cost.plannedCostCents)}. Realizado: ${formatCents(cost.totalCostCents)} (${difference === 0 ? "igual ao previsto" : `${formatCents(Math.abs(difference))} ${difference > 0 ? "acima" : "abaixo"} do previsto`}).`,
      margin,
      y,
    );
    y += 5;
  }
  if (cost.taxSource !== "none") {
    pdf.text(`Imposto estimado: ${formatCents(cost.taxCents)} (${formatTaxRate(cost.taxRateBps)} do valor cobrado).`, margin, y);
    y += 5;
  }
  font("normal", 8, MUTED);
  pdf.text(
    cost.taxSource === "none"
      ? "Resultado = valor cobrado menos gastos ligados ao serviço e horas da equipe. Não desconta impostos nem despesas fixas."
      : "Resultado = valor cobrado menos gastos ligados, horas da equipe, imposto estimado e taxa do cartão. Não desconta despesas fixas.",
    margin,
    y,
  );
  y += 6;

  const table = (title: string, head: string[], body: string[][], foot?: string[]) => {
    const footRow = foot?.map((content, index) => ({ content, styles: index === foot.length - 1 ? { halign: "right" as const } : {} }));
    font("bold", 11, NAVY);
    pdf.text(title, margin, y + 4);
    autoTable(pdf, {
      startY: y + 7,
      head: [head],
      body,
      foot: footRow ? [footRow] : undefined,
      margin: { left: margin, right: margin, bottom: 18 },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, textColor: INK },
      headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: "bold" },
      columnStyles: { [head.length - 1]: { halign: "right" } },
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  };

  if (cost.categories.length > 0) {
    table("Custos por categoria", ["Categoria", "Valor"], cost.categories.map((category) => [category.name, formatCents(category.totalCents)]), ["Total", formatCents(allCostsCents(cost))]);
  }
  if (cost.expenses.length > 0) {
    table(
      "Gastos lançados",
      ["Data", "Descrição", "Fornecedor", "Valor"],
      cost.expenses.map((expense) => [formatDate(expense.expense_date), expense.description, expense.supplier ?? "", formatCents(expense.amount_cents)]),
    );
  }
  if (cost.labor.length > 0) {
    table(
      "Mão de obra (horas das visitas)",
      ["Pessoa", "Horas", "Custo/hora", "Custo"],
      cost.labor.map((line) => [line.name, formatHours(line.minutes), line.rateCents ? formatCents(line.rateCents) : "sem custo cadastrado", formatCents(line.costCents)]),
    );
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    font("normal", 7.5, MUTED);
    pdf.text(`${input.companyName}  ·  Resultado do serviço  ·  Uso interno`, margin, pdf.internal.pageSize.getHeight() - 8);
    pdf.text(`Página ${page} de ${pages}`, width - margin, pdf.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  pdf.save(`resultado-servico-${input.quoteNumber}.pdf`);
}
