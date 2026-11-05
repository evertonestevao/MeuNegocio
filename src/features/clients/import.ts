import { z } from "zod";
import { isValidPhone, formatPhone } from "@/lib/masks";

/**
 * Importação de clientes: as colunas reconhecidas, a leitura de cada linha e o que é duplicado. Roda
 * no navegador, para a prévia, e de novo no servidor antes de gravar.
 */

export type ImportField = "name" | "document" | "phone" | "email" | "contact" | "address" | "city" | "notes";

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ["nome", "cliente", "nome do cliente", "razao social", "nome fantasia", "empresa"],
  document: ["cpf", "cnpj", "cpf/cnpj", "cpf ou cnpj", "cnpj/cpf", "documento"],
  phone: ["telefone", "celular", "whatsapp", "fone", "telefone/whatsapp"],
  email: ["email", "e-mail"],
  contact: ["contato", "nome do contato", "responsavel"],
  address: ["endereco", "logradouro", "endereco completo", "rua"],
  city: ["cidade", "cidade/uf", "municipio"],
  notes: ["observacoes", "observacao", "obs", "notas"],
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Qual coluna é qual campo. Coluna desconhecida é ignorada; repetida, vale a primeira. */
export function mapHeaders(headers: string[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {};
  headers.forEach((header, index) => {
    const key = normalize(header);
    const field = (Object.keys(HEADER_ALIASES) as ImportField[]).find((candidate) => HEADER_ALIASES[candidate].includes(key));
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

export const IMPORT_TEMPLATE = [
  ["Nome", "CPF/CNPJ", "Telefone", "E-mail", "Contato", "Endereço", "Cidade", "Observações"],
  ["Padaria Pão Dourado", "12.345.678/0001-90", "(14) 99999-0000", "contato@padaria.com.br", "João Silva", "Rua das Flores, 120 - Centro", "Bauru/SP", "Atende de manhã"],
];

export const MAX_IMPORT_ROWS = 1000;

/** Vazio chega como "" da planilha ou null do navegador (já conferido): os dois valem. */
const text = (schema: z.ZodString) => z.preprocess((value) => value ?? "", schema);

/** O que vai para o banco por cliente. */
export const importRowSchema = z.object({
  name: z.string().trim().min(2, "Sem nome do cliente.").max(160, "Nome com mais de 160 caracteres."),
  document: text(z.string().trim())
    .refine((value) => value === "" || [11, 14].includes(value.replace(/\D/g, "").length), "CPF ou CNPJ incompleto.")
    .transform((value) => value || null),
  notes: text(z.string().trim().max(2000, "Observações com mais de 2000 caracteres.")).transform((value) => value || null),
  contact: z
    .object({
      name: z.string().trim().min(2).max(160),
      phone: text(z.string().trim())
        .refine((value) => value === "" || isValidPhone(value), "Telefone sem DDD ou incompleto.")
        .transform((value) => (value ? formatPhone(value) : null)),
      email: text(z.string().trim())
        .refine((value) => value === "" || z.email().safeParse(value).success, "E-mail inválido.")
        .transform((value) => value || null),
    })
    .nullable(),
  location: z.object({ name: z.string().trim().min(2), address: z.string().trim().min(5, "Endereço muito curto.").max(300) }).nullable(),
});

export type ImportRow = z.output<typeof importRowSchema>;

export interface ImportPreviewLine {
  /** Linha na planilha, contando o cabeçalho, para a pessoa achar o erro. */
  line: number;
  name: string;
  status: "ready" | "duplicate" | "error";
  message: string | null;
  row: ImportRow | null;
}

const documentKey = (value: string | null) => (value ? value.replace(/\D/g, "") : "");

/** Monta e confere cada linha. Duplicado: mesmo CPF/CNPJ, ou mesmo nome sem documento, já cadastrado ou repetido na planilha. */
export function previewImport(rows: string[][], existing: { name: string; document: string | null }[]): ImportPreviewLine[] {
  const [headers = [], ...lines] = rows;
  const map = mapHeaders(headers);
  if (map.name === undefined) return [];
  const cell = (cells: string[], field: ImportField) => (map[field] === undefined ? "" : (cells[map[field]!] ?? "").trim());
  const seenDocuments = new Set(existing.map((client) => documentKey(client.document)).filter(Boolean));
  const seenNames = new Set(existing.map((client) => normalize(client.name)));

  return lines.slice(0, MAX_IMPORT_ROWS).map((cells, index): ImportPreviewLine => {
    const line = index + 2;
    const name = cell(cells, "name");
    const phone = cell(cells, "phone");
    const email = cell(cells, "email");
    const contactName = cell(cells, "contact");
    const address = [cell(cells, "address"), cell(cells, "city")].filter(Boolean).join(" - ");
    const parsed = importRowSchema.safeParse({
      name,
      document: cell(cells, "document"),
      notes: cell(cells, "notes"),
      // Sem nome do contato, o contato leva o nome do cliente.
      contact: contactName || phone || email ? { name: contactName || name, phone, email } : null,
      location: address ? { name: "Principal", address } : null,
    });
    if (!parsed.success) return { line, name, status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos.", row: null };

    const doc = documentKey(parsed.data.document);
    const key = normalize(parsed.data.name);
    if (doc ? seenDocuments.has(doc) : seenNames.has(key)) {
      return { line, name, status: "duplicate", message: doc ? "CPF/CNPJ já cadastrado." : "Cliente com este nome já cadastrado.", row: null };
    }
    if (doc) seenDocuments.add(doc);
    seenNames.add(key);
    return { line, name, status: "ready", message: null, row: parsed.data };
  });
}
