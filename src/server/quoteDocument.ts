import "server-only";
import type { Client, ClientLocation, CompanyProfile, Quote, QuoteItem } from "@/types/database";
import type { QuoteDocument } from "@/types/quotes";

export function buildQuoteDocument(params: {
  quote: Quote;
  items: QuoteItem[];
  companyName: string;
  profile: CompanyProfile;
  client: Client | null;
  location: ClientLocation | null;
  approval?: QuoteDocument["approval"];
}): QuoteDocument {
  const { quote, items, companyName, profile, client, location, approval = null } = params;
  return {
    number: quote.number,
    title: quote.title,
    status: quote.status,
    createdAt: quote.created_at,
    validUntil: quote.valid_until,
    company: { name: companyName, cnpj: profile.cnpj, phone: profile.phone, email: profile.email, address: profile.address },
    client: client ? { name: client.name, document: client.document } : null,
    location: location ? { name: location.name, address: location.address } : null,
    items: items.map((item) => ({
      description: item.description,
      unit: item.unit,
      pricingMode: item.pricing_mode,
      quantity: item.quantity,
      people: item.people,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.line_total_cents,
    })),
    subtotalCents: quote.subtotal_cents,
    discountCents: quote.discount_cents,
    totalCents: quote.total_cents,
    notes: quote.notes,
    approval,
  };
}
