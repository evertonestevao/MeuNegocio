import { z } from "zod";
import { digitsOnly, documentProblem, formatPhone, isValidPhone } from "@/lib/masks";

/**
 * Importação de clientes: as colunas reconhecidas, a leitura de cada linha e o que é duplicado. Roda
 * no navegador, para a prévia, e de novo no servidor antes de gravar.
 */

export type ImportField =
  | "name"
  | "document"
  | "phone"
  | "email"
  | "contact"
  | "address"
  | "number"
  | "complement"
  | "district"
  | "city"
  | "state"
  | "zip"
  | "notes";

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ["nome", "cliente", "nome do cliente", "razao social", "nome fantasia", "empresa"],
  document: ["cpf", "cnpj", "cpf/cnpj", "cpf ou cnpj", "cnpj/cpf", "documento"],
  phone: ["telefone", "celular", "whatsapp", "fone", "telefone/whatsapp"],
  email: ["email", "e-mail"],
  contact: ["contato", "nome do contato", "responsavel"],
  address: ["endereco", "logradouro", "endereco completo", "rua"],
  number: ["numero", "n", "n.", "no", "no.", "nº", "n°", "num", "nro"],
  complement: ["complemento"],
  district: ["bairro"],
  city: ["cidade", "cidade/uf", "municipio"],
  state: ["estado", "uf"],
  zip: ["cep"],
  notes: ["observacoes", "observacao", "obs", "notas"],
};

/** Nome de cada campo para mostrar na prévia quais colunas entram. */
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: "Nome",
  document: "CPF/CNPJ",
  phone: "Telefone",
  email: "E-mail",
  contact: "Contato",
  address: "Endereço",
  number: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "Estado",
  zip: "CEP",
  notes: "Observações",
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export type ColumnMapping = Partial<Record<ImportField, number>>;

/**
 * Escolha manual: a coluna passa a ser o campo escolhido (ou nenhum, com null). Cada campo vale
 * para uma coluna só: se já estava em outra, sai de lá.
 */
export function assignColumn(mapping: ColumnMapping, column: number, field: ImportField | null): ColumnMapping {
  const next: ColumnMapping = {};
  for (const [key, index] of Object.entries(mapping) as [ImportField, number][]) {
    if (index !== column && key !== field) next[key] = index;
  }
  if (field) next[field] = column;
  return next;
}

/** Qual coluna é qual campo. Coluna desconhecida é ignorada; repetida, vale a primeira. */
export function mapHeaders(headers: string[]): ColumnMapping {
  const map: ColumnMapping = {};
  headers.forEach((header, index) => {
    const key = normalize(header);
    const field = (Object.keys(HEADER_ALIASES) as ImportField[]).find((candidate) => HEADER_ALIASES[candidate].includes(key));
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

/** O que a prévia mostra antes das linhas: quais colunas entram, como quê, e quais ficam de fora. */
export function describeColumns(headers: string[]): { used: { header: string; label: string }[]; ignored: string[] } {
  const map = mapHeaders(headers);
  const usedIndexes = new Map(Object.entries(map).map(([field, index]) => [index, IMPORT_FIELD_LABELS[field as ImportField]]));
  const used: { header: string; label: string }[] = [];
  const ignored: string[] = [];
  headers.forEach((header, index) => {
    const label = usedIndexes.get(index);
    if (label) used.push({ header: header.trim(), label });
    else if (header.trim()) ignored.push(header.trim());
  });
  return { used, ignored };
}

export const IMPORT_TEMPLATE = [
  ["Nome", "CPF/CNPJ", "Telefone", "E-mail", "Contato", "Endereço", "Número", "Complemento", "Bairro", "Cidade", "Estado", "CEP", "Observações"],
  [
    "Padaria Pão Dourado",
    "11.222.333/0001-81",
    "(14) 99999-0000",
    "contato@padaria.com.br",
    "João Silva",
    "Rua das Flores",
    "120",
    "Loja 2",
    "Centro",
    "Bauru",
    "SP",
    "17010-000",
    "Atende de manhã",
  ],
];

export const MAX_IMPORT_ROWS = 1000;

/**
 * Endereço numa linha só, como o local de atendimento guarda:
 * "Rua das Flores, 120, Loja 2 - Centro, Bauru/SP - CEP 17010-000". Parte vazia some.
 */
export function composeAddress(parts: {
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const street = [parts.address, parts.number, parts.complement].filter(Boolean).join(", ");
  const cityState = parts.city && parts.state && !parts.city.includes("/") ? `${parts.city}/${parts.state}` : parts.city || parts.state;
  const locality = [parts.district, cityState].filter(Boolean).join(", ");
  const zipDigits = digitsOnly(parts.zip);
  const zip = zipDigits.length === 8 ? `CEP ${zipDigits.slice(0, 5)}-${zipDigits.slice(5)}` : parts.zip ? `CEP ${parts.zip}` : "";
  return [street, locality, zip].filter(Boolean).join(" - ");
}

/** Vazio chega como "" da planilha ou null do navegador (já conferido): os dois valem. */
const text = (schema: z.ZodString) => z.preprocess((value) => value ?? "", schema);

/** O que vai para o banco por cliente. */
export const importRowSchema = z.object({
  name: z.string().trim().min(2, "Sem nome do cliente.").max(160, "Nome com mais de 160 caracteres."),
  document: text(z.string().trim())
    .superRefine((value, ctx) => {
      const problem = documentProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
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
  // Só a cidade já ajuda o técnico a se localizar: o mínimo é o de um nome de cidade.
  location: z
    .object({ name: z.string().trim().min(2), address: z.string().trim().min(2, "Endereço muito curto.").max(300, "Endereço com mais de 300 caracteres.") })
    .nullable(),
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

const documentKey = (value: string | null) => (value ? digitsOnly(value) : "");

/**
 * Monta e confere cada linha. Duplicado: mesmo CPF/CNPJ, ou mesmo nome sem documento, já cadastrado
 * ou repetido na planilha. A ordem das mensagens segue o que mais importa: nome, documento,
 * duplicado e só então contato e endereço, para um erro menor não esconder um duplicado.
 */
export function previewImport(
  rows: string[][],
  existing: { name: string; document: string | null }[],
  /** Qual coluna é qual campo, quando a pessoa escolheu à mão; sem ela, pelos títulos. */
  mapping?: ColumnMapping,
): ImportPreviewLine[] {
  const [headers = [], ...lines] = rows;
  const map = mapping ?? mapHeaders(headers);
  if (map.name === undefined) return [];
  const cell = (cells: string[], field: ImportField) => (map[field] === undefined ? "" : (cells[map[field]!] ?? "").trim());
  const seenDocuments = new Set(existing.map((client) => documentKey(client.document)).filter(Boolean));
  const seenNames = new Set(existing.map((client) => normalize(client.name)));

  return lines.slice(0, MAX_IMPORT_ROWS).map((cells, index): ImportPreviewLine => {
    const line = index + 2;
    const name = cell(cells, "name");
    const document = cell(cells, "document");
    const phone = cell(cells, "phone");
    const email = cell(cells, "email");
    const contactName = cell(cells, "contact");
    const address = composeAddress({
      address: cell(cells, "address"),
      number: cell(cells, "number"),
      complement: cell(cells, "complement"),
      district: cell(cells, "district"),
      city: cell(cells, "city"),
      state: cell(cells, "state"),
      zip: cell(cells, "zip"),
    });
    const parsed = importRowSchema.safeParse({
      name,
      document,
      notes: cell(cells, "notes"),
      // Sem nome do contato, o contato leva o nome do cliente.
      contact: contactName || phone || email ? { name: contactName || name, phone, email } : null,
      location: address ? { name: "Principal", address } : null,
    });
    const issues = parsed.success ? [] : parsed.error.issues;
    const identityIssue = issues.find((issue) => issue.path[0] === "name") ?? issues.find((issue) => issue.path[0] === "document");
    if (identityIssue) return { line, name, status: "error", message: identityIssue.message, row: null };

    const doc = documentKey(document);
    const key = normalize(name);
    if (doc ? seenDocuments.has(doc) : seenNames.has(key)) {
      return { line, name, status: "duplicate", message: doc ? "CPF/CNPJ já cadastrado." : "Cliente com este nome já cadastrado.", row: null };
    }
    if (!parsed.success) return { line, name, status: "error", message: issues[0]?.message ?? "Dados inválidos.", row: null };
    if (doc) seenDocuments.add(doc);
    seenNames.add(key);
    return { line, name, status: "ready", message: null, row: parsed.data };
  });
}
