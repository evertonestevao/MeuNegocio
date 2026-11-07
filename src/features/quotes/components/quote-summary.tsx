import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { paymentPlanText } from "@/lib/installments";
import { formatCents } from "@/lib/money";
import type { ClientPickerOption, Quote, QuoteItem } from "@/types/database";
import { quoteItemDetail } from "../pdf";

/**
 * Orçamento que já saiu do rascunho, só para ler: o que foi combinado com o cliente, como no PDF.
 * O formulário inteiro desabilitado ocupava metros de tela no celular.
 */
export function QuoteSummary({ quote, items, client }: { quote: Quote; items: QuoteItem[]; client: ClientPickerOption | undefined }) {
  const location = client?.locations.find((candidate) => candidate.id === quote.location_id) ?? null;
  const terms = paymentPlanText(quote.payment_plan, quote.total_cents);
  const facts = [
    ["Cliente", client?.name ?? "Sem cliente"],
    ["Local do serviço", location?.name ?? "Sem local definido"],
    ["Válido até", quote.valid_until ? formatDate(quote.valid_until) : "—"],
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{quote.title || "Sem título"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <dl className="grid gap-3 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>

        <ul className="flex flex-col divide-y border-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words">{item.description}</span>
                <span className="text-xs text-muted-foreground">
                  {quoteItemDetail({
                    description: item.description,
                    unit: item.unit,
                    pricingMode: item.pricing_mode,
                    quantity: item.quantity,
                    people: item.people,
                    unitPriceCents: item.unit_price_cents,
                    lineTotalCents: item.line_total_cents,
                  })}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatCents(item.line_total_cents)}</span>
            </li>
          ))}
        </ul>

        {quote.discount_cents > 0 ? (
          <p className="flex justify-between gap-3">
            <span className="text-muted-foreground">Desconto</span>
            <span className="tabular-nums">- {formatCents(quote.discount_cents)}</span>
          </p>
        ) : null}
        {terms ? (
          <p>
            <span className="text-muted-foreground">Condições de pagamento: </span>
            {terms}
          </p>
        ) : null}
        {quote.notes ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Observações e condições</span>
            <p className="break-words whitespace-pre-line">{quote.notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
