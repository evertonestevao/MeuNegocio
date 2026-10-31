import type { PricingMode, QuoteStatus } from "./database";

/** O que o cliente pode ver de um orçamento: base do PDF e do link público. Sem custo. */
export interface QuoteDocument {
  number: number;
  title: string | null;
  status: QuoteStatus;
  createdAt: string;
  validUntil: string | null;
  company: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  client: { name: string; document: string | null } | null;
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
}

export interface PublicQuote {
  companyId: string;
  quoteId: string;
  isWithinValidity: boolean;
  document: QuoteDocument;
  response: { decision: "approved" | "refused"; name: string; comment: string | null; createdAt: string } | null;
}
