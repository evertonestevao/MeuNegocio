import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_READ_ONLY_CODE, DEMO_READ_ONLY_MESSAGE, type DemoProfile } from "@/config/demo";
import { addMonths } from "@/lib/calendar";
import { effectiveAnnex, rbt12Cents, simplesRate } from "@/lib/simplesNacional";
import type { CompanyTax, SimplesAnnex } from "@/types/tax";
import rawFixtures from "./fixtures.json";

/**
 * Substituto do client Supabase na demonstração. Lê dados fixos em memória e recusa toda escrita.
 * Não recebe URL nem chave e não faz requisição: é isso que garante que a demonstração nunca
 * alcança o banco, seja qual for a tela ou a action que o chamou.
 */

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null; count?: number | null };

const BASELINE = "2026-10-31";
const READ_ONLY_ERROR = { code: DEMO_READ_ONLY_CODE, message: DEMO_READ_ONLY_MESSAGE };
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

function todayInBrazil(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** Dias entre a data em que os dados foram montados e hoje. */
export function demoDayOffset(now: Date = new Date()): number {
  return Math.round((Date.parse(todayInBrazil(now)) - Date.parse(BASELINE)) / 86_400_000);
}

/** Traz todas as datas para perto de hoje, para a agenda e o financeiro nunca parecerem antigos. */
export function shiftDates<T>(value: T, offsetDays: number): T {
  if (typeof value === "string" && DATE_PREFIX.test(value)) {
    const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
    if (Number.isNaN(date.getTime())) return value;
    date.setUTCDate(date.getUTCDate() + offsetDays);
    const iso = date.toISOString();
    return (value.length === 10 ? iso.slice(0, 10) : iso) as T;
  }
  if (Array.isArray(value)) return value.map((item) => shiftDates(item, offsetDays)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftDates(item, offsetDays)])) as T;
  }
  return value;
}

/**
 * Valores por mês não podem andar por dias: no dia 1, tudo ficaria no mês anterior e o financeiro
 * zerado. Andam por meses, mantêm o dia e, no mês atual, nunca passam de hoje.
 */
export function shiftToCurrentMonth(date: string, today: string, capAtToday = true): string {
  const [baseYear, baseMonth] = BASELINE.split("-").map(Number);
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const months = (todayYear - baseYear) * 12 + todayMonth - baseMonth;
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
  return capAtToday && shifted > today ? today : shifted;
}

const MONTHLY_DATE_COLUMNS: Record<string, string> = { revenues: "competence_date", expenses: "expense_date" };

let cache: { offset: number; fixtures: typeof rawFixtures } | undefined;
function fixtures() {
  const offset = demoDayOffset();
  if (cache?.offset !== offset) {
    const shifted = shiftDates(rawFixtures, offset);
    const today = todayInBrazil(new Date());
    const original = rawFixtures.tables as unknown as Record<string, Row[]>;
    const tables = shifted.tables as unknown as Record<string, Row[]>;
    for (const [table, column] of Object.entries(MONTHLY_DATE_COLUMNS)) {
      tables[table].forEach((row, index) => {
        row[column] = shiftToCurrentMonth(String(original[table][index][column]), today);
      });
    }
    // Parcelas andam com o faturamento, por meses. O vencimento pode ficar no futuro; a data de
    // recebimento, não.
    tables.receivables.forEach((row, index) => {
      const source = original.receivables[index];
      row.due_date = shiftToCurrentMonth(String(source.due_date), today, false);
      if (source.received_on) row.received_on = shiftToCurrentMonth(String(source.received_on), today);
    });
    cache = { offset, fixtures: shifted };
  }
  return cache.fixtures;
}

/** Divide "a, b:c(d, e)" nas vírgulas de primeiro nível. */
function splitColumns(columns: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of columns) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const TO_ONE_KEY: Record<string, string> = { profile: "user_id", terms: "terms_version_id", supplier_ref: "supplier_id" };
const PARENT_KEY: Record<string, string> = { clients: "client_id", visits: "visit_id", quotes: "quote_id" };

function project(tables: Record<string, Row[]>, table: string, row: Row, columns: string): Row {
  const result: Row = {};
  for (const part of splitColumns(columns)) {
    if (part === "*") {
      Object.assign(result, row);
      continue;
    }
    const embed = part.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\(([\s\S]*)\)$/);
    if (!embed) {
      result[part] = row[part];
      continue;
    }
    const [, alias, target, inner] = embed;
    const name = alias ?? target;
    const rows = tables[target] ?? [];
    const localKey = TO_ONE_KEY[name] ?? `${name}_id`;
    if (localKey in row) {
      const found = rows.find((candidate) => candidate.id === row[localKey]);
      result[name] = found ? project(tables, target, found, inner) : null;
    } else {
      const parentKey = PARENT_KEY[table];
      result[name] = rows.filter((candidate) => candidate[parentKey] === row.id).map((candidate) => project(tables, target, candidate, inner));
    }
  }
  return result;
}

function valueAt(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current as Row | null | undefined)?.[key], row);
}

const compare = (a: unknown, b: unknown) => String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true });

class DemoQuery implements PromiseLike<Result> {
  private columns = "*";
  private filters: ((row: Row) => boolean)[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private window: [number, number] | null = null;
  private cardinality: "one" | "maybe" | null = null;
  private countRows = false;
  private headOnly = false;
  private write = false;

  constructor(private readonly table: string, private readonly tables: Record<string, Row[]>) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.columns = columns;
    this.countRows = Boolean(options?.count);
    this.headOnly = Boolean(options?.head);
    return this;
  }
  insert() { this.write = true; return this; }
  update() { this.write = true; return this; }
  upsert() { this.write = true; return this; }
  delete() { this.write = true; return this; }

  private where(test: (row: Row) => boolean) { this.filters.push(test); return this; }
  eq(column: string, value: unknown) { return this.where((row) => valueAt(row, column) === value); }
  neq(column: string, value: unknown) { return this.where((row) => valueAt(row, column) !== value); }
  is(column: string, value: unknown) { return this.where((row) => (valueAt(row, column) ?? null) === value); }
  in(column: string, values: unknown[]) { return this.where((row) => values.includes(valueAt(row, column))); }
  gte(column: string, value: unknown) { return this.where((row) => compare(valueAt(row, column), value) >= 0); }
  lte(column: string, value: unknown) { return this.where((row) => compare(valueAt(row, column), value) <= 0); }
  gt(column: string, value: unknown) { return this.where((row) => compare(valueAt(row, column), value) > 0); }
  lt(column: string, value: unknown) { return this.where((row) => compare(valueAt(row, column), value) < 0); }
  not(column: string, _operator: string, value: unknown) { return this.where((row) => (valueAt(row, column) ?? null) !== value); }
  /** Só a busca por texto: name.ilike."%x%",document.ilike."%x%". */
  or(expression: string) {
    const terms = [...expression.matchAll(/(\w+)\.ilike\."?%?((?:[^"%]|\\.)*)%?"?/g)].map((match) => ({ column: match[1], text: match[2].toLowerCase() }));
    return this.where((row) => terms.some(({ column, text }) => String(row[column] ?? "").toLowerCase().includes(text)));
  }
  filter(column: string, _operator: string, value: unknown) { return this.eq(column, value); }
  order(column: string, options?: { ascending?: boolean }) { this.sorts.push({ column, ascending: options?.ascending ?? true }); return this; }
  range(from: number, to: number) { this.window = [from, to]; return this; }
  limit(size: number) { this.window = [0, size - 1]; return this; }
  single() { this.cardinality = "one"; return this; }
  maybeSingle() { this.cardinality = "maybe"; return this; }

  private run(): Result {
    if (this.write) return { data: null, error: READ_ONLY_ERROR };
    const source = this.tables[this.table] ?? [];
    // Mantém todas as colunas: os filtros usam colunas que a consulta não pediu de volta.
    let rows = source.map((row) => project(this.tables, this.table, row, `*, ${this.columns}`));
    rows = rows.filter((row) => this.filters.every((test) => test(row)));
    for (const { column, ascending } of [...this.sorts].reverse()) {
      rows = rows.toSorted((a, b) => (ascending ? 1 : -1) * compare(valueAt(a, column), valueAt(b, column)));
    }
    const count = this.countRows ? rows.length : null;
    if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
    if (this.headOnly) return { data: null, error: null, count };
    if (this.cardinality) {
      if (this.cardinality === "one" && rows.length === 0) return { data: null, error: { code: "PGRST116", message: "Sem resultado" } };
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }

  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}
class DemoRpc implements PromiseLike<Result> {
  constructor(private readonly result: Result) {}
  single() { return this; }
  maybeSingle() { return this; }
  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

const DEMO_CHECKLISTS = {
  assessment: ["Conferir local e acesso", "Medir e fotografar o que será orçado", "Anotar materiais necessários", "Combinar próximos passos com o cliente"],
  execution: ["Conferir EPIs e ferramentas", "Isolar e sinalizar a área", "Executar o serviço", "Testar o funcionamento", "Limpar o local", "Mostrar o resultado ao cliente"],
};

/** Mesmo formato de get_public_quote, montado só com os dados fictícios. */
function demoPublicQuoteRow(token: string): Row | null {
  const { tables } = fixtures() as unknown as { tables: Record<string, Row[]> };
  const quotes = tables.quotes;
  const quote = quotes.find((row) => row.public_token === token) ?? (token === "demonstracao" ? quotes.find((row) => row.status === "sent") : undefined);
  if (!quote) return null;
  const company = tables.companies.find((row) => row.id === quote.company_id);
  const profile = tables.company_profiles.find((row) => row.company_id === quote.company_id);
  const client = tables.clients.find((row) => row.id === quote.client_id);
  const location = tables.client_locations.find((row) => row.id === quote.location_id);
  // Um rascunho só recebe link ao ser enviado: quem abre vê como enviado.
  const status = quote.status === "draft" ? "sent" : quote.status;
  return {
    company_id: quote.company_id,
    quote_id: quote.id,
    number: quote.number,
    title: quote.title,
    status,
    valid_until: quote.valid_until ?? shiftDates("2026-11-15", demoDayOffset()),
    is_within_validity: true,
    created_at: quote.created_at,
    subtotal_cents: quote.subtotal_cents,
    discount_cents: quote.discount_cents,
    total_cents: quote.total_cents,
    notes: quote.notes,
    payment_plan: quote.payment_plan ?? null,
    company: { name: company?.name, cnpj: profile?.cnpj, phone: profile?.phone, email: profile?.email, address: profile?.address, logo_path: profile?.logo_path },
    client: { name: client?.name, document: client?.document },
    location: location ? { name: location.name, address: location.address } : null,
    items: tables.quote_items.filter((item) => item.quote_id === quote.id && !item.deleted_at),
    // Aprovado: resposta fictícia com assinatura servida pelo próprio site, sem bucket.
    response:
      status === "approved" || status === "closed"
        ? {
            decision: "approved",
            name: tables.client_contacts.find((contact) => contact.client_id === quote.client_id)?.name ?? client?.name,
            comment: "Pode agendar para a próxima semana, de manhã.",
            created_at: quote.approved_at,
            signature_path: "/exemplos/assinatura-cliente.png",
          }
        : null,
  };
}

/** Faturamento fictício dos meses de antes do sistema, informado pela empresa da demonstração. */
const DEMO_INFORMED_CENTS = 2_200_000;

/** get_company_tax com os dados fixos: meses lançados vêm das receitas; os anteriores, informados. */
function demoCompanyTax(tables: Record<string, Row[]>): CompanyTax {
  const profile = tables.company_profiles[0];
  const month = `${todayInBrazil(new Date()).slice(0, 7)}-01`;
  const months = Array.from({ length: 12 }, (_, index) => {
    const start = addMonths(month, -(index + 1));
    const launched = tables.revenues
      .filter((revenue) => !revenue.deleted_at && String(revenue.competence_date).startsWith(start.slice(0, 7)))
      .reduce((sum, revenue) => sum + Number(revenue.amount_cents), 0);
    return { month: start, launched_cents: launched, informed_cents: launched === 0 ? DEMO_INFORMED_CENTS : null };
  });
  const annex = profile.simples_annex as SimplesAnnex;
  const applied = effectiveAnnex(annex, profile.fator_r === true);
  const revenue = months.reduce((sum, item) => sum + (item.informed_cents ?? item.launched_cents), 0);
  const rbt12 = rbt12Cents(months.map((item) => item.informed_cents ?? item.launched_cents));
  const rate = simplesRate(applied, rbt12);
  return {
    regime: "simples",
    manual_rate_bps: Number(profile.tax_rate_bps),
    auto: profile.tax_rate_auto === true,
    annex,
    fator_r: profile.fator_r === true,
    activity_started_on: null,
    cash_basis: profile.tax_cash_basis === true,
    rate_bps: rate.rateBps,
    detail: {
      month,
      annex,
      effective_annex: applied,
      revenue_cents: revenue,
      months: 12,
      rbt12_cents: rbt12,
      bracket: rate.bracket,
      nominal_bps: rate.nominalBps,
      deduction_cents: rate.deductionCents,
      rate_bps: rate.rateBps,
      over_limit: rate.overLimit,
    },
    months,
  };
}

function callRpc(name: string, args: Row): Result {
  const { rpc } = fixtures() as unknown as { rpc: { hours: { entries: unknown[] } & Row; myVisits: Row[]; sheets: Record<string, unknown> } };
  const ok = (data: unknown): Result => ({ data, error: null });
  switch (name) {
    case "is_super_admin":
    case "resellers_enabled":
    case "is_valid_referral_code":
      return ok(false);
    case "my_reseller_status":
      return ok(null);
    case "get_public_quote":
      return ok(demoPublicQuoteRow(String(args.p_token)));
    case "get_company_tax":
      return ok(demoCompanyTax((fixtures() as unknown as { tables: Record<string, Row[]> }).tables));
    case "my_pending_invites":
      return ok([]);
    case "get_hours_month": {
      const currentMonth = todayInBrazil(new Date()).slice(0, 7);
      return ok(String(args.p_month).slice(0, 7) === currentMonth ? rpc.hours : { ...rpc.hours, entries: [], suggestions: [] });
    }
    case "list_my_visits":
      return ok(
        rpc.myVisits.filter((visit) => {
          const date = String(visit.visit_date);
          return date >= String(args.p_from) && date <= String(args.p_to);
        }),
      );
    case "list_checklist_templates":
      return ok(DEMO_CHECKLISTS);
    case "get_visit_sheet":
      return ok(rpc.sheets[String(args.p_visit_id)] ?? null);
    default:
      return { data: null, error: READ_ONLY_ERROR };
  }
}

const refused = async () => ({ data: null, error: READ_ONLY_ERROR });

export function createDemoClient(profile: DemoProfile): SupabaseClient {
  const data = fixtures() as unknown as { userId: string; tables: Record<string, Row[]> };
  const tables: Record<string, Row[]> = {
    ...data.tables,
    company_members: data.tables.company_members.map((member) => ({ ...member, role: profile })),
  };
  const user = { id: data.userId, email: "demonstracao@exemplo.com", user_metadata: {} };
  const client = {
    from: (table: string) => new DemoQuery(table, tables),
    rpc: (name: string, args: Row = {}) => new DemoRpc(callRpc(name, args)),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: user.id } }, error: null }),
      signOut: async () => ({ error: null }),
      signUp: refused,
      signInWithPassword: refused,
      resetPasswordForEmail: refused,
      updateUser: refused,
      admin: { deleteUser: refused, generateLink: refused, inviteUserByEmail: refused },
    },
    storage: {
      from: () => ({
        upload: refused,
        remove: refused,
        list: async () => ({ data: [], error: null }),
        createSignedUrl: refused,
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
  return client as unknown as SupabaseClient;
}
