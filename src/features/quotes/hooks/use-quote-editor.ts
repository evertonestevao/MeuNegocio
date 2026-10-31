"use client";

import { useMemo, useState } from "react";
import { centsToMoneyInput, parseMoneyToCents } from "@/lib/money";
import { estimatedCostCents, lineTotalCents, marginPercent, subtotalCents, totalCents } from "@/lib/quoteCalc";
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
  unitPrice: string;
}

function parseQuantity(value: string): number {
  const normalized = Number(value.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

function toCalcLine(line: EditorLine) {
  return {
    pricingMode: line.pricingMode,
    quantity: parseQuantity(line.quantity),
    people: Math.max(Number(line.people) || 1, 1),
    unitPriceCents: parseMoneyToCents(line.unitPrice) ?? 0,
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
}) {
  const { quote, items, catalog, initial } = params;
  const [clientId, setClientId] = useState(quote?.client_id ?? initial.clientId);
  const [locationId, setLocationId] = useState(quote?.location_id ?? null);
  const [title, setTitle] = useState(quote?.title ?? "");
  const [validUntil, setValidUntil] = useState(quote ? (quote.valid_until ?? "") : (initial.validUntil ?? ""));
  const [discount, setDiscount] = useState(quote ? centsToMoneyInput(quote.discount_cents) : "0");
  const [notes, setNotes] = useState(quote ? (quote.notes ?? "") : initial.notes);
  const [lines, setLines] = useState<EditorLine[]>(() =>
    items.map((item) => ({
      key: item.id,
      catalogItemId: item.catalog_item_id,
      description: item.description,
      unit: item.unit,
      pricingMode: item.pricing_mode,
      quantity: String(item.quantity).replace(".", ","),
      people: String(item.people),
      unitPrice: centsToMoneyInput(item.unit_price_cents),
    })),
  );

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
      },
    ]);
  }

  function addCustom() {
    setLines((current) => [
      ...current,
      { key: newKey(), catalogItemId: null, description: "", unit: "un", pricingMode: "fixed", quantity: "1", people: "1", unitPrice: "0,00" },
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
    const costs = new Map(catalog.map((item) => [item.id, item.cost_cents]));
    const canSeeCost = catalog.some((item) => item.cost_cents !== null);
    const cost = estimatedCostCents(
      lines.map((line, index) => ({
        ...calc[index],
        costCents: line.catalogItemId ? (costs.get(line.catalogItemId) ?? null) : null,
      })),
    );
    return {
      subtotal: subtotalCents(calc),
      total,
      lineTotal: (line: EditorLine) => lineTotalCents(toCalcLine(line)),
      estimate: canSeeCost ? { cost, profit: total - cost, margin: marginPercent(total, cost) } : null,
    };
  }, [lines, discount, catalog]);

  function toInput(): QuoteInput {
    return {
      clientId,
      locationId,
      title,
      validUntil: validUntil || null,
      discountCents: parseMoneyToCents(discount) ?? -1,
      notes,
      items: lines.map((line) => ({
        catalogItemId: line.catalogItemId,
        description: line.description,
        unit: line.unit,
        pricingMode: line.pricingMode,
        quantity: parseQuantity(line.quantity),
        people: Math.max(Number(line.people) || 1, 1),
        unitPriceCents: parseMoneyToCents(line.unitPrice) ?? -1,
      })),
    };
  }

  return {
    clientId, chooseClient, locationId, setLocationId, title, setTitle, validUntil, setValidUntil,
    discount, setDiscount, notes, setNotes, lines, addFromCatalog, addCustom, updateLine, removeLine, totals, toInput,
  };
}
