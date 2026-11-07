import type { DocumentCompany, PricingMode, QuoteStatus } from "./database";

/** O que o cliente pode ver de um orçamento: base do PDF e do link público. Sem custo. */
export interface QuoteDocument {
  number: number;
  title: string | null;
  status: QuoteStatus;
  createdAt: string;
  validUntil: string | null;
  company: DocumentCompany;
  /** Telefone e e-mail do contato principal, quando houver. */
  client: { name: string; document: string | null; phone?: string | null; email?: string | null } | null;
  location: { name: string; address: string } | null;
  items: {
    description: string;
    unit: string;
    pricingMode: PricingMode;
    quantity: number;
    people: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  notes: string | null;
  /** Condições de pagamento em texto, para o cliente ("Entrada de R$ 500,00 e 3x de ..."). */
  paymentTerms?: string | null;
  /** Aprovação pelo link: quem, quando, a observação e a assinatura (link temporário). */
  approval?: { name: string; comment: string | null; approvedAt: string; signatureUrl: string | null } | null;
}

export interface PublicQuote {
  companyId: string;
  quoteId: string;
  isWithinValidity: boolean;
  document: QuoteDocument;
  response: { decision: "approved" | "refused"; name: string; comment: string | null; createdAt: string; signaturePath: string | null } | null;
}
