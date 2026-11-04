"use client";

import { useMemo, useState } from "react";
import { centsToMoneyInput, parseMoneyToCents } from "@/lib/money";
import { estimatedCostCents, lineTotalCents, marginPercent, priceWithMarkup, subtotalCents, totalCents, type MarkupMode } from "@/lib/quoteCalc";
import type { CatalogItem, PricingMode, Quote, QuoteItem } from "@/types/database";
import type { QuoteInput } from "../schemas";

export interface EditorLine {
  key: string;
  catalogItemId: string | null;
  description: string;
  unit: string;
  pricingMode: PricingMode;
  quantity: string;
  people: string;
  /** O valor digitado. Com "a mais", é o que você paga; sem ele, é o preço do cliente. */
  unitPrice: string;
  /** Só você vê: o que vai a mais sobre o valor digitado, em % ou em R$ por unidade. */
  markup: string;
  markupMode: MarkupMode;
}

function parseMarkup(line: Pick<EditorLine, "markup" | "markupMode">): number | null {
  if (!line.markup.trim()) return null;
  if (line.markupMode === "amount") return parseMoneyToCents(line.markup);
  const value = Number(line.markup.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseQuantity(value: string): number {
  const normalized = Number(value.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

/** Preço unitário que o cliente vê: o valor digitado mais o "a mais", quando houver. */
export function clientUnitPriceCents(line: Pick<EditorLine, "unitPrice" | "markup" | "markupMode">): number {
  const base = parseMoneyToCents(line.unitPrice) ?? 0;
  const markup = parseMarkup(line);
  return markup === null ? base : priceWithMarkup(base, markup, line.markupMode);
}

function toCalcLine(line: EditorLine) {
  return {
    pricingMode: line.pricingMode,
    quantity: parseQuantity(line.quantity),
    people: Math.max(Number(line.people) || 1, 1),
    unitPriceCents: clientUnitPriceCents(line),
  };
}

let nextKey = 0;
const newKey = () => `line-${(nextKey += 1)}`;

/** Estado da tela do orçamento: itens em edição e totais ao vivo. O banco recalcula ao salvar. */
export function useQuoteEditor(params: {
  quote: Quote | null;
  items: QuoteItem[];
  catalog: CatalogItem[];
  initial: { clientId: string | null; validUntil: string | null; notes: string };
  canSeeCost: boolean;
}) {
  const { quote, items, catalog, initial, canSeeCost } = params;
  const [clientId, setClientId] = useState(quote?.client_id ?? initial.clientId);
  const [locationId, setLocationId] = useState(quote?.location_id ?? null);
  const [title, setTitle] = useState(quote?.title ?? "");
  const [validUntil, setValidUntil] = useState(quote ? (quote.valid_until ?? "") : (initial.validUntil ?? ""));
  const [discount, setDiscount] = useState(quote ? centsToMoneyInput(quote.discount_cents) : "0");
  const [notes, setNotes] = useState(quote ? (quote.notes ?? "") : initial.notes);
  const [lines, setLines] = useState<EditorLine[]>(() =>
    items.map((item) => {
      // Item salvo com "a mais": o custo guardado é o valor digitado e a diferença é o "a mais".
      const withMarkup = item.cost_cents !== null && item.cost_cents !== undefined && item.cost_cents < item.unit_price_cents;
      return {
        key: item.id,
        catalogItemId: item.catalog_item_id,
        description: item.description,
        unit: item.unit,
        pricingMode: item.pricing_mode,
        quantity: String(item.quantity).replace(".", ","),
        people: String(item.people),
        unitPrice: centsToMoneyInput(withMarkup ? item.cost_cents! : item.unit_price_cents),
        markup: withMarkup ? centsToMoneyInput(item.unit_price_cents - item.cost_cents!) : "",
        markupMode: (withMarkup ? "amount" : "percent") as MarkupMode,
      };
    }),
  );
  const catalogCost = (id: string | null) => (id ? (catalog.find((item) => item.id === id)?.cost_cents ?? null) : null);

  function chooseClient(id: string | null) {
    setClientId(id);
    setLocationId(null);
  }

  function addFromCatalog(itemId: string) {
    const item = catalog.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setLines((current) => [
      ...current,
      {
        key: newKey(),
        catalogItemId: item.id,
        description: item.name,
        unit: item.unit,
        pricingMode: item.pricing_mode,
        quantity: "1",
        people: "1",
        unitPrice: centsToMoneyInput(item.price_cents),
        markup: "",
        markupMode: "percent",
      },
    ]);
  }

  function addCustom() {
    setLines((current) => [
      ...current,
      { key: newKey(), catalogItemId: null, description: "", unit: "un", pricingMode: "fixed", quantity: "1", people: "1", unitPrice: "0,00", markup: "", markupMode: "percent" },
    ]);
  }

  function updateLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.pricingMode === "hourly") next.unit = "h";
        if (patch.pricingMode === "fixed" && line.unit === "h") next.unit = "un";
        return next;
      }),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  const totals = useMemo(() => {
    const calc = lines.map(toCalcLine);
    const discountCents = parseMoneyToCents(discount) ?? 0;
    const total = totalCents(calc, discountCents);
    // Com "a mais", o custo é o valor digitado; sem ele, o custo do catálogo, quando houver.
    const lineCost = (line: EditorLine) => (parseMarkup(line) !== null ? (parseMoneyToCents(line.unitPrice) ?? 0) : catalogCost(line.catalogItemId));
    const cost = estimatedCostCents(lines.map((line, index) => ({ ...calc[index], costCents: lineCost(line) })));
    return {
      subtotal: subtotalCents(calc),
      total,
      lineTotal: (line: EditorLine) => lineTotalCents(toCalcLine(line)),
      clientUnitPrice: clientUnitPriceCents,
      /** Quanto o "a mais" deixa na linha; null sem "a mais". */
      lineGain: (line: EditorLine) => {
        if (parseMarkup(line) === null) return null;
        const total = lineTotalCents(toCalcLine(line));
        const costTotal = estimatedCostCents([{ ...toCalcLine(line), costCents: parseMoneyToCents(line.unitPrice) ?? 0 }]);
        return { cents: total - costTotal, margin: marginPercent(total, costTotal) };
      },
      estimate: canSeeCost ? { cost, profit: total - cost, margin: marginPercent(total, cost) } : null,
    };
    // catalogCost depende só do catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, discount, canSeeCost, catalog]);

  function toInput(): QuoteInput {
    return {
      clientId,
      locationId,
      title,
      validUntil: validUntil || null,
      discountCents: parseMoneyToCents(discount) ?? -1,
      notes,
      items: lines.map((line) => {
        const hasMarkup = parseMarkup(line) !== null;
        return {
          catalogItemId: line.catalogItemId,
          description: line.description,
          unit: line.unit,
          pricingMode: line.pricingMode,
          quantity: parseQuantity(line.quantity),
          people: Math.max(Number(line.people) || 1, 1),
          unitPriceCents: parseMoneyToCents(line.unitPrice) === null ? -1 : clientUnitPriceCents(line),
          // Só com "a mais" o valor digitado vira custo. Quem não vê custo não manda nada.
          costCents: canSeeCost ? (hasMarkup ? (parseMoneyToCents(line.unitPrice) ?? null) : null) : undefined,
        };
      }),
    };
  }

  return {
    clientId, chooseClient, locationId, setLocationId, title, setTitle, validUntil, setValidUntil,
    discount, setDiscount, notes, setNotes, lines, addFromCatalog, addCustom, updateLine, removeLine, totals, toInput,
  };
}
