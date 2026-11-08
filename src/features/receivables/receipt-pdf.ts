import { PAYMENT_METHOD_RECEIPT_PHRASE } from "@/features/expenses/schemas";
import { formatQuoteNumber } from "@/features/quotes/status";
import { formatDate } from "@/lib/dates";
import { centsToWords } from "@/lib/extenso";
import { formatDocument, formatPhone } from "@/lib/masks";
import { formatCents } from "@/lib/money";
import { loadPdfLogo } from "@/features/documents/pdf-image";
import type { ReceiptData } from "@/types/finance";

/** Número do recibo: o orçamento e a parcela ("0054-2"). */
export function receiptNumber(receipt: ReceiptData): string {
  return `${formatQuoteNumber(receipt.quoteNumber)}-${receipt.installment.index}`;
}

/** O texto do recibo, do jeito que se escreve à mão. */
export function receiptText(receipt: ReceiptData): string {
  const payer = receipt.client ? `${receipt.client.name}${receipt.client.document ? `, ${receipt.client.document.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"} ${formatDocument(receipt.client.document)},` : ""}` : "cliente";
  const installment = receipt.installment.total > 1 ? `da parcela ${receipt.installment.index} de ${receipt.installment.total} ` : "";
  const service = `do orçamento Nº ${formatQuoteNumber(receipt.quoteNumber)}${receipt.quoteTitle ? ` (${receipt.quoteTitle})` : ""}`;
  const method = receipt.method ? `, ${PAYMENT_METHOD_RECEIPT_PHRASE[receipt.method]}` : "";
  return `Recebemos de ${payer} a importância de ${formatCents(receipt.receivedCents)} (${centsToWords(receipt.receivedCents)}), referente ao pagamento ${installment}${service}, recebida em ${formatDate(receipt.receivedOn)}${method}.`;
}

async function buildReceiptPdf(receipt: ReceiptData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 20;
  let y = 24;

  const logo = await loadPdfLogo(receipt.company.logoUrl, 45, 18);
  if (logo) {
    pdf.addImage(logo.data, logo.format, margin, 14, logo.width, logo.height, undefined, "FAST");
    y = 14 + logo.height + 7;
  }

  pdf.setFont("helvetica", "bold").setFontSize(15).setTextColor(20).text(receipt.company.name, margin, y);
  pdf.setFontSize(13).text(`Recibo Nº ${receiptNumber(receipt)}`, width - margin, y, { align: "right" });
  y += 6;
  const companyLines = [
    receipt.company.cnpj ? `CNPJ ${formatDocument(receipt.company.cnpj)}` : null,
    receipt.company.address,
    [receipt.company.phone ? formatPhone(receipt.company.phone) : null, receipt.company.email].filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => Boolean(line));
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(90).text(companyLines, margin, y);
  y += companyLines.length * 4 + 6;
  pdf.setDrawColor(210).line(margin, y, width - margin, y);
  y += 14;

  pdf.setFont("helvetica", "bold").setFontSize(20).setTextColor(20).text("RECIBO", width / 2, y, { align: "center" });
  y += 9;
  pdf.setFontSize(14).text(formatCents(receipt.receivedCents), width / 2, y, { align: "center" });
  y += 14;

  const body: string[] = pdf.splitTextToSize(receiptText(receipt), width - margin * 2);
  pdf.setFont("helvetica", "normal").setFontSize(11.5).setTextColor(30).text(body, margin, y, { lineHeightFactor: 1.6 });
  y += body.length * 7 + 8;
  pdf.text("Para clareza, firmamos o presente recibo.", margin, y);
  y += 30;

  pdf.setDrawColor(120).line(width / 2 - 45, y, width / 2 + 45, y);
  y += 5;
  pdf.setFont("helvetica", "bold").setFontSize(10).text(receipt.company.name, width / 2, y, { align: "center" });
  if (receipt.company.cnpj) {
    y += 4.5;
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(90).text(`CNPJ ${formatDocument(receipt.company.cnpj)}`, width / 2, y, { align: "center" });
  }
  return { pdf, fileName: `recibo-${receiptNumber(receipt)}.pdf` };
}

/**
 * No celular, abre o compartilhar do aparelho com o PDF anexado (WhatsApp, e-mail...). Onde não dá
 * para compartilhar arquivo, baixa o PDF.
 */
export async function shareReceiptPdf(receipt: ReceiptData): Promise<void> {
  const { pdf, fileName } = await buildReceiptPdf(receipt);
  const file = new File([pdf.output("blob")], fileName, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Recibo Nº ${receiptNumber(receipt)}` });
      return;
    } catch (err) {
      // Cancelar o compartilhar não é erro; outro problema cai no download.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  pdf.save(fileName);
}
