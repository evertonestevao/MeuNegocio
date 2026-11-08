import { formatDate, formatTimestamp } from "@/lib/dates";
import { formatDocument, formatPhone } from "@/lib/masks";
import type { DocumentCompany } from "@/types/database";
import type { VisitSheet } from "@/types/workOrders";
import { VISIT_KIND_DOCUMENT_LABEL } from "./schemas";
import { fitInFrame, loadImage, loadPdfLogo } from "@/features/documents/pdf-image";

export interface WorkOrderPdfInput {
  sheet: VisitSheet;
  company: DocumentCompany;
  photoUrls: Record<string, string>;
  signatureUrl: string | null;
}

type Rgb = [number, number, number];

const NAVY: Rgb = [23, 34, 47];
const AMBER: Rgb = [240, 180, 41];
const BLUE: Rgb = [13, 87, 176];
const GREEN: Rgb = [14, 122, 74];
const INK: Rgb = [31, 41, 55];
const MUTED: Rgb = [100, 112, 128];
const LINE: Rgb = [221, 226, 233];
const SOFT: Rgb = [244, 246, 249];
const WHITE: Rgb = [255, 255, 255];

const MARGIN = 15;
const FOOTER_SPACE = 18;
const PHOTO_FRAME_HEIGHT = 60;
const PHOTO_GAP = 6;
const CAPTION_LINE = 4.2;

/** Rótulo numerado da foto, com a legenda quando houver. */
export function photoLabel(index: number, caption: string | null): string {
  const text = caption?.trim();
  return text ? `Foto ${index + 1} — ${text}` : `Foto ${index + 1}`;
}

/** Duração entre dois horários "HH:MM[:SS]". Vazio se o fim não existir ou não for posterior. */
export function workedTime(start: string, end: string | null): string {
  if (!end) return "";
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const total = minutes(end) - minutes(start);
  if (total <= 0) return "";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

/** Nome do arquivo sem acentos nem símbolos. */
export function workOrderFileName(clientName: string, date: string): string {
  const slug = clientName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `ordem-de-servico-${slug ? `${slug}-` : ""}${date}.pdf`;
}


/** Gera o PDF no navegador, com as fotos e a assinatura. As bibliotecas só carregam ao pedir. */
export async function downloadWorkOrderPdf({ sheet, company, photoUrls, signatureUrl }: WorkOrderPdfInput): Promise<void> {
  const order = sheet.work_order;
  if (!order) return;
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usable = pageWidth - MARGIN * 2;
  const bottom = pageHeight - FOOTER_SPACE;
  const continuationTop = 20;
  let y = 0;

  const font = (style: "normal" | "bold", size: number, color: Rgb) => {
    pdf.setFont("helvetica", style).setFontSize(size).setTextColor(color[0], color[1], color[2]);
  };
  const fill = (color: Rgb) => pdf.setFillColor(color[0], color[1], color[2]);
  const stroke = (color: Rgb, lineWidth = 0.25) => {
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(lineWidth);
  };
  const wrap = (text: string, width: number): string[] => pdf.splitTextToSize(text, width);
  const ensure = (needed: number) => {
    if (y + needed > bottom) {
      pdf.addPage();
      y = continuationTop;
    }
  };

  const section = (title: string, needed: number, aside?: string) => {
    ensure(13 + needed);
    y += 4;
    fill(AMBER);
    pdf.rect(MARGIN, y - 3.4, 1.2, 4.4, "F");
    font("bold", 11, NAVY);
    pdf.text(title, MARGIN + 3.5, y);
    if (aside) {
      font("normal", 8.5, MUTED);
      pdf.text(aside, pageWidth - MARGIN, y, { align: "right" });
    }
    y += 2.8;
    stroke(LINE);
    pdf.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 4.5;
  };

  // Cabeçalho
  const companyLines = [
    company.cnpj ? `CNPJ ${formatDocument(company.cnpj)}` : null,
    company.address,
    [company.phone ? formatPhone(company.phone) : null, company.email].filter(Boolean).join("  ·  ") || null,
  ].filter((line): line is string => Boolean(line));
  // Logo numa caixa branca: no fundo escuro, um logo de traço escuro sumiria.
  const logo = await loadPdfLogo(company.logoUrl, 30, 16);
  const logoBox = logo ? { width: logo.width + 4, height: logo.height + 4 } : null;
  const textX = logoBox ? MARGIN + logoBox.width + 5 : MARGIN;
  const textWidth = usable * 0.6 - (textX - MARGIN);
  font("bold", 16, WHITE);
  const nameLines = wrap(company.name, textWidth).slice(0, 2);
  // Endereço e demais linhas podem passar de uma linha (ex.: o CEP não cabia e sumia). Área mais
  // larga que a do nome, deixando folga só para o bloco da direita (data/situação), para o e-mail
  // não cortar. Teto generoso para nada ser truncado.
  const infoWidth = pageWidth - MARGIN - textX - 30;
  const companyTextLines = companyLines.flatMap((line) => wrap(line, infoWidth)).slice(0, 7);
  const bandHeight = Math.max(32, 13 + nameLines.length * 6.5 + companyTextLines.length * 3.9, logoBox ? logoBox.height + 14 : 0);
  fill(NAVY);
  pdf.rect(0, 0, pageWidth, bandHeight, "F");
  fill(AMBER);
  pdf.rect(0, bandHeight, pageWidth, 1.1, "F");
  if (logo && logoBox) {
    fill(WHITE);
    pdf.roundedRect(MARGIN, 7, logoBox.width, logoBox.height, 1.5, 1.5, "F");
    pdf.addImage(logo.data, logo.format, MARGIN + 2, 9, logo.width, logo.height, undefined, "FAST");
  }
  let headerY = 13;
  for (const line of nameLines) {
    pdf.text(line, textX, headerY);
    headerY += 6.5;
  }
  font("normal", 8.5, [205, 213, 224]);
  headerY -= 1.5;
  for (const line of companyTextLines) {
    pdf.text(line, textX, headerY);
    headerY += 3.9;
  }
  font("bold", 8.5, AMBER);
  pdf.text("ORDEM DE SERVIÇO", pageWidth - MARGIN, 11, { align: "right" });
  font("bold", 12.5, WHITE);
  pdf.text(formatDate(sheet.visit_date), pageWidth - MARGIN, 17.5, { align: "right" });
  const statusText = order.status === "completed" ? "Concluída" : "Em andamento";
  font("bold", 8, WHITE);
  const chipWidth = pdf.getTextWidth(statusText) + 6;
  const chipColor = order.status === "completed" ? GREEN : BLUE;
  fill(chipColor);
  pdf.roundedRect(pageWidth - MARGIN - chipWidth, 20.5, chipWidth, 5.6, 2.8, 2.8, "F");
  pdf.text(statusText, pageWidth - MARGIN - chipWidth / 2, 24.3, { align: "center" });
  y = bandHeight + 8;

  // Quadro de dados
  const worked = workedTime(order.started_time, order.finished_time);
  const schedule = `${order.started_time.slice(0, 5)}${order.finished_time ? ` às ${order.finished_time.slice(0, 5)}` : ""}`;
  // Quando o contato é o próprio cliente, não repetir o nome: mostra só função e/ou telefone.
  const contactIsClient = sheet.contact ? sheet.contact.name.trim() === sheet.client_name.trim() : false;
  const contactHeadline = sheet.contact
    ? [contactIsClient ? null : sheet.contact.name, sheet.contact.role].filter(Boolean).join("  ·  ")
    : "";
  const contact = sheet.contact
    ? [contactHeadline || null, sheet.contact.phone ? formatPhone(sheet.contact.phone) : null].filter(Boolean).join("\n") || null
    : null;
  const cards: Array<{ label: string; title: string; detail: string | null }> = [
    { label: "CLIENTE", title: sheet.client_name, detail: contact },
    { label: "LOCAL DO SERVIÇO", title: sheet.location.name, detail: sheet.location.address },
    { label: "SERVIÇO", title: VISIT_KIND_DOCUMENT_LABEL[sheet.kind], detail: `${schedule}${worked ? `  ·  ${worked} de trabalho` : ""}` },
    { label: "EQUIPE", title: sheet.team.join(", ") || "Não informada", detail: null },
  ];
  const cardGap = 4;
  const cardWidth = (usable - cardGap) / 2;
  const cardPadding = 3.5;
  const cardHeightOf = (card: (typeof cards)[number]) => {
    font("bold", 10, INK);
    const titleLines = wrap(card.title, cardWidth - cardPadding * 2).length;
    font("normal", 8.5, MUTED);
    const detailLines = card.detail ? wrap(card.detail, cardWidth - cardPadding * 2).length : 0;
    return { titleLines, detailLines, height: 10.5 + titleLines * 4.4 + detailLines * 3.9 };
  };
  for (let index = 0; index < cards.length; index += 2) {
    const row = cards.slice(index, index + 2);
    const rowHeight = Math.max(...row.map((card) => cardHeightOf(card).height));
    ensure(rowHeight + cardGap);
    row.forEach((card, column) => {
      const x = MARGIN + column * (cardWidth + cardGap);
      fill(SOFT);
      pdf.roundedRect(x, y, cardWidth, rowHeight, 1.8, 1.8, "F");
      font("bold", 7, MUTED);
      pdf.text(card.label, x + cardPadding, y + 5.2);
      font("bold", 10, INK);
      const titleLines = wrap(card.title, cardWidth - cardPadding * 2);
      pdf.text(titleLines, x + cardPadding, y + 10);
      if (card.detail) {
        font("normal", 8.5, MUTED);
        pdf.text(wrap(card.detail, cardWidth - cardPadding * 2), x + cardPadding, y + 10.3 + titleLines.length * 4.4);
      }
    });
    y += rowHeight + cardGap;
  }

  // Checklist
  const doneCount = order.checklist.filter((item) => item.done).length;
  if (order.checklist.length > 0) {
    const columnWidth = (usable - 6) / 2;
    const textWidth = columnWidth - 7;
    font("normal", 9.5, INK);
    const rows: Array<typeof order.checklist> = [];
    for (let index = 0; index < order.checklist.length; index += 2) rows.push(order.checklist.slice(index, index + 2));
    section("Checklist", 8, `${doneCount} de ${order.checklist.length} concluídos`);
    for (const row of rows) {
      font("normal", 9.5, INK);
      const lineCount = Math.max(...row.map((item) => wrap(item.label, textWidth).length));
      const rowHeight = lineCount * 4.3 + 2.6;
      ensure(rowHeight);
      row.forEach((item, column) => {
        const x = MARGIN + column * (columnWidth + 6);
        if (item.done) {
          fill(GREEN);
          pdf.roundedRect(x, y - 3.2, 4, 4, 0.8, 0.8, "F");
          stroke(WHITE, 0.55);
          pdf.line(x + 0.9, y - 1.2, x + 1.7, y - 0.3);
          pdf.line(x + 1.7, y - 0.3, x + 3.2, y - 2.3);
        } else {
          stroke(MUTED, 0.3);
          pdf.roundedRect(x, y - 3.2, 4, 4, 0.8, 0.8, "S");
        }
        font("normal", 9.5, item.done ? INK : MUTED);
        pdf.text(wrap(item.label, textWidth), x + 6.5, y);
      });
      y += rowHeight;
    }
    y += 2;
  }

  // Relatório: quebra de página linha a linha, com o fundo acompanhando.
  if (order.report) {
    font("normal", 9.5, INK);
    const lines = wrap(order.report.trim(), usable - 8);
    section("Relatório do serviço", 12);
    let cursor = 0;
    while (cursor < lines.length) {
      const fits = Math.max(1, Math.floor((bottom - y - 6) / 4.6));
      const chunk = lines.slice(cursor, cursor + fits);
      const boxHeight = chunk.length * 4.6 + 5;
      fill(SOFT);
      pdf.roundedRect(MARGIN, y, usable, boxHeight, 1.8, 1.8, "F");
      font("normal", 9.5, INK);
      pdf.text(chunk, MARGIN + 4, y + 5.4, { lineHeightFactor: 1.37 });
      y += boxHeight + 3;
      cursor += chunk.length;
      if (cursor < lines.length) {
        pdf.addPage();
        y = continuationTop;
      }
    }
    y += 1;
  }

  // Fotos em duas colunas, com moldura de tamanho fixo e a legenda afastada da imagem.
  const photos = order.photos.filter((photo) => photoUrls[photo.id]);
  if (photos.length > 0) {
    const frameWidth = (usable - PHOTO_GAP) / 2;
    const captionHeight = (photo: (typeof photos)[number], index: number) => {
      font("normal", 8.5, INK);
      return wrap(photoLabel(index, photo.caption), frameWidth).length * CAPTION_LINE;
    };
    let titlePending = true;
    for (let index = 0; index < photos.length; index += 2) {
      const pair = photos.slice(index, index + 2);
      const textHeight = Math.max(...pair.map((photo, offset) => captionHeight(photo, index + offset)));
      const rowHeight = PHOTO_FRAME_HEIGHT + 3.5 + textHeight;
      if (titlePending) {
        section("Registro fotográfico", rowHeight, photos.length === 1 ? "1 foto" : `${photos.length} fotos`);
        titlePending = false;
      } else {
        ensure(rowHeight);
      }
      for (const [offset, photo] of pair.entries()) {
        const x = MARGIN + offset * (frameWidth + PHOTO_GAP);
        const image = await loadImage(photoUrls[photo.id]);
        const fit = fitInFrame(image.width, image.height, frameWidth - 2, PHOTO_FRAME_HEIGHT - 2);
        fill(SOFT);
        stroke(LINE);
        pdf.roundedRect(x, y, frameWidth, PHOTO_FRAME_HEIGHT, 1.5, 1.5, "FD");
        pdf.addImage(image.data, image.format, x + 1 + fit.offsetX, y + 1 + fit.offsetY, fit.width, fit.height);
        const caption = wrap(photoLabel(index + offset, photo.caption), frameWidth);
        font("normal", 8.5, INK);
        pdf.text(caption, x, y + PHOTO_FRAME_HEIGHT + 5);
      }
      y += rowHeight + 5;
    }
  }

  // Assinatura sempre inteira; bloco compacto para ficar junto do relatório quando couber,
  // em vez de cair sozinha numa página quase vazia.
  if (signatureUrl) {
    const image = await loadImage(signatureUrl);
    const blockWidth = 86;
    const fit = fitInFrame(image.width, image.height, blockWidth, 16);
    section("Aceite do cliente", 24);
    pdf.addImage(image.data, image.format, MARGIN, y + fit.offsetY, fit.width, fit.height);
    y += 17;
    stroke(INK, 0.3);
    pdf.line(MARGIN, y, MARGIN + blockWidth, y);
    y += 4.5;
    font("bold", 9.5, INK);
    pdf.text(order.signature_name ?? "", MARGIN, y);
    y += 4.2;
    font("normal", 8.5, MUTED);
    pdf.text(`Assinado em ${formatTimestamp(order.signed_at)}`, MARGIN, y);
    y += 4;
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    if (page > 1) {
      font("bold", 8.5, NAVY);
      pdf.text(company.name, MARGIN, 11);
      font("normal", 8.5, MUTED);
      pdf.text(`Ordem de serviço  ·  ${sheet.client_name}  ·  ${formatDate(sheet.visit_date)}`, pageWidth - MARGIN, 11, { align: "right" });
      stroke(LINE);
      pdf.line(MARGIN, 14, pageWidth - MARGIN, 14);
    }
    stroke(LINE);
    pdf.line(MARGIN, pageHeight - 12, pageWidth - MARGIN, pageHeight - 12);
    font("normal", 7.5, MUTED);
    pdf.text(`${company.name}  ·  Ordem de serviço`, MARGIN, pageHeight - 8);
    pdf.text(`Página ${page} de ${pages}`, pageWidth - MARGIN, pageHeight - 8, { align: "right" });
  }
  pdf.save(workOrderFileName(sheet.client_name, sheet.visit_date));
}
