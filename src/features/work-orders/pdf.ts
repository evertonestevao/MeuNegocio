import { formatDate, formatTimestamp } from "@/lib/dates";
import type { VisitSheet } from "@/types/workOrders";
import { VISIT_KIND_DOCUMENT_LABEL } from "./schemas";

export interface WorkOrderPdfInput {
  sheet: VisitSheet;
  company: { name: string; cnpj: string | null; phone: string | null; email: string | null; address: string | null };
  photoUrls: Record<string, string>;
  signatureUrl: string | null;
}

async function loadImage(url: string): Promise<{ data: string; width: number; height: number; format: "JPEG" | "PNG" }> {
  const blob = await (await fetch(url)).blob();
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { data, ...size, format: blob.type === "image/png" ? "PNG" : "JPEG" };
}

/** Gera o PDF no navegador, com as fotos e a assinatura. As bibliotecas só carregam ao pedir. */
export async function downloadWorkOrderPdf({ sheet, company, photoUrls, signatureUrl }: WorkOrderPdfInput): Promise<void> {
  const order = sheet.work_order;
  if (!order) return;
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const usable = width - margin * 2;
  let y = 20;

  const ensure = (needed: number) => {
    if (y + needed > height - 16) {
      pdf.addPage();
      y = 20;
    }
  };
  const heading = (text: string) => {
    ensure(12);
    y += 3;
    pdf.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(20).text(text, margin, y);
    y += 5.5;
  };
  const paragraph = (text: string) => {
    pdf.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(50);
    const lines: string[] = pdf.splitTextToSize(text, usable);
    for (const line of lines) {
      ensure(5);
      pdf.text(line, margin, y);
      y += 4.6;
    }
  };

  pdf.setFont("helvetica", "bold").setFontSize(15).text(company.name, margin, y);
  pdf.setFontSize(12).text("Ordem de serviço", width - margin, y, { align: "right" });
  y += 6;
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  const companyLines = [
    company.cnpj ? `CNPJ ${company.cnpj}` : null,
    company.address,
    [company.phone, company.email].filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => Boolean(line));
  pdf.text(companyLines, margin, y);
  y += companyLines.length * 4.2 + 4;
  pdf.setDrawColor(210).line(margin, y, width - margin, y);
  y += 4;

  heading("Serviço");
  paragraph(`${VISIT_KIND_DOCUMENT_LABEL[sheet.kind]} em ${formatDate(sheet.visit_date)}`);
  paragraph(`Cliente: ${sheet.client_name}`);
  paragraph(`Local: ${sheet.location.name} — ${sheet.location.address}`);
  paragraph(`Equipe: ${sheet.team.join(", ")}`);
  paragraph(`Início: ${order.started_time.slice(0, 5)}${order.finished_time ? ` · Fim: ${order.finished_time.slice(0, 5)}` : ""}`);

  heading("Checklist");
  for (const item of order.checklist) paragraph(`${item.done ? "[x]" : "[  ]"} ${item.label}`);

  if (order.report) {
    heading("Relatório");
    paragraph(order.report);
  }

  if (order.photos.length > 0) {
    heading("Fotos");
    for (const photo of order.photos) {
      const url = photoUrls[photo.id];
      if (!url) continue;
      const image = await loadImage(url);
      const scale = Math.min(usable / image.width, 90 / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      ensure(drawHeight + 8);
      pdf.addImage(image.data, image.format, margin, y, drawWidth, drawHeight);
      y += drawHeight + 2;
      if (photo.caption) paragraph(photo.caption);
      y += 3;
    }
  }

  if (signatureUrl) {
    heading("Assinatura do cliente");
    const image = await loadImage(signatureUrl);
    const scale = Math.min(80 / image.width, 30 / image.height);
    ensure(image.height * scale + 12);
    pdf.addImage(image.data, image.format, margin, y, image.width * scale, image.height * scale);
    y += image.height * scale + 3;
    paragraph(`${order.signature_name ?? ""} · ${formatTimestamp(order.signed_at)}`);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    pdf.text(`${company.name} — Ordem de serviço`, margin, height - 8);
    pdf.text(`Página ${page} de ${pages}`, width - margin, height - 8, { align: "right" });
  }
  pdf.save(`ordem-de-servico-${sheet.visit_date}.pdf`);
}
