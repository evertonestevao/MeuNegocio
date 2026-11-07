import { digitsOnly } from "@/lib/masks";
import { searchTerms } from "@/lib/search";
import type { ClientPickerOption } from "@/types/database";

/** A partir de quantos clientes a lista ganha o campo de filtro. */
export const CLIENT_FILTER_FROM = 8;

/**
 * Clientes que batem com o que foi digitado: nome sem diferença de acento ou maiúscula, ou os
 * números do CPF/CNPJ. O escolhido continua na lista, para a seleção não sumir ao filtrar.
 */
export function filterClientOptions(options: ClientPickerOption[], query: string, selectedId: string | null): ClientPickerOption[] {
  const { text, digits } = searchTerms(query);
  if (!text) return options;
  const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return options.filter(
    (option) =>
      option.id === selectedId ||
      plain(option.name).includes(text) ||
      (digits !== null && option.document ? digitsOnly(option.document).includes(digits) : false),
  );
}
