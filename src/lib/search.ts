import { digitsOnly } from "./masks";

/**
 * O que se procura numa busca digitada: o texto sem acento e em minúsculas, como o banco guarda em
 * `search_text`, e, quando a pessoa digitou um número (CPF, CNPJ, telefone), só os dígitos, com ou
 * sem pontuação. Número curto demais acharia quase tudo: fica só como texto.
 */
export function searchTerms(search: string): { text: string; digits: string | null } {
  const text = search
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  const digits = digitsOnly(search);
  const looksLikeNumber = /^[\d\s.\-/()+]+$/.test(search.trim());
  return { text, digits: looksLikeNumber && digits.length >= 3 ? digits : null };
}
