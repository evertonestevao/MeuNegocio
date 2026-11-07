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

/**
 * Contato principal na lista: o nome só quando é outra pessoa. Na importação, o contato nasce com o
 * nome do cliente, e repetir o nome logo abaixo dele só ocupa espaço.
 */
export function contactSummary(client: { name: string; primary_contact_name: string | null; primary_contact_phone: string | null }): string | null {
  const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const name = client.primary_contact_name && plain(client.primary_contact_name) !== plain(client.name) ? client.primary_contact_name : null;
  return [name, client.primary_contact_phone].filter(Boolean).join(" · ") || null;
}
