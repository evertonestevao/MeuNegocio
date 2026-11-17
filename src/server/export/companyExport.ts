import "server-only";
import { buildCsv } from "@/lib/csvExport";
import { buildZip, type ZipEntry } from "@/lib/zip";
import { AppError } from "@/lib/errors";
import { getSupabaseAdminClient } from "@/server/supabase-admin";

/**
 * Cópia dos dados da empresa (portabilidade, LGPD): um .zip com um CSV por assunto. Lê com service_role,
 * SEMPRE filtrando pela empresa e sem os registros apagados. Quem chama já conferiu que o ator é o
 * proprietário. Não leva dados de pagamento de funcionários nem o link público dos orçamentos.
 */

interface ExportTable {
  table: string;
  file: string;
  /** Colunas que não saem no arquivo. */
  omit?: string[];
}

export const EXPORT_TABLES: ExportTable[] = [
  { table: "clients", file: "clientes.csv" },
  { table: "client_contacts", file: "contatos-dos-clientes.csv" },
  { table: "client_locations", file: "locais-dos-clientes.csv" },
  { table: "quotes", file: "orcamentos.csv", omit: ["public_token"] },
  { table: "quote_items", file: "itens-dos-orcamentos.csv" },
  { table: "receivables", file: "contas-a-receber.csv" },
  { table: "revenues", file: "receitas.csv" },
  { table: "expenses", file: "gastos.csv" },
  { table: "suppliers", file: "fornecedores.csv" },
  { table: "catalog_items", file: "catalogo-de-servicos.csv" },
  { table: "work_orders", file: "ordens-de-servico.csv" },
  { table: "visits", file: "agenda-de-visitas.csv" },
  { table: "employees", file: "funcionarios.csv" },
  { table: "time_entries", file: "horas.csv" },
];

/** Colunas internas, sem utilidade para quem recebe a cópia. */
const NOISE_COLUMNS = ["search_text", "deleted_at"];
const PAGE = 1000;
const MAX_ROWS_PER_TABLE = 50_000;

const README = `Cópia dos seus dados

Cada arquivo .csv é uma planilha (separador ";", abre direto no Excel e no Google Planilhas).
Os arquivos trazem só o que não foi excluído. Valores em dinheiro estão em centavos
(ex.: 12990 = R$ 129,90). Os campos "id" ligam um arquivo ao outro (ex.: client_id em
orcamentos.csv aponta para o id em clientes.csv).

Fotos das ordens de serviço não vão neste arquivo.
Dúvidas: fale com o suporte.
`;

async function fetchTable(companyId: string, { table, omit = [] }: ExportTable): Promise<Array<Record<string, unknown>>> {
  const client = getSupabaseAdminClient();
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new AppError("internal_error", "Falha ao exportar", { table, code: error.code });
    const page = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of page) {
      for (const column of [...omit, ...NOISE_COLUMNS]) delete row[column];
      rows.push(row);
    }
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function buildCompanyExport(companyId: string): Promise<{ zip: Uint8Array; counts: Record<string, number> }> {
  const entries: ZipEntry[] = [{ name: "LEIA-ME.txt", content: README }];
  const counts: Record<string, number> = {};
  for (const table of EXPORT_TABLES) {
    const rows = await fetchTable(companyId, table);
    counts[table.table] = rows.length;
    // Tabela vazia sai só com o cabeçalho de colunas conhecidas? Sem linhas não há colunas: pula.
    if (rows.length > 0) entries.push({ name: table.file, content: buildCsv(rows) });
  }
  return { zip: buildZip(entries), counts };
}
