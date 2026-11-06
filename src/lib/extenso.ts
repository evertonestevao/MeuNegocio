/** Valor por extenso em reais, como no recibo: "mil duzentos e trinta e quatro reais e cinquenta centavos". */

const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 0 a 999. */
function upToThousand(value: number): string {
  if (value === 100) return "cem";
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundred) parts.push(HUNDREDS[hundred]);
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest]);
    else parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? ` e ${UNITS[rest % 10]}` : ""));
  }
  return parts.join(" e ");
}

const SCALES: [number, string, string][] = [
  [1_000_000_000, "bilhão", "bilhões"],
  [1_000_000, "milhão", "milhões"],
  [1_000, "mil", "mil"],
];

/** Inteiro por extenso, com o "e" onde se fala: "mil e quinhentos", "dois mil, trezentos e dez". */
export function numberToWords(value: number): string {
  if (value === 0) return UNITS[0];
  const groups: { words: string; amount: number }[] = [];
  let rest = value;
  for (const [size, singular, plural] of SCALES) {
    const count = Math.floor(rest / size);
    if (count) {
      groups.push({ words: size === 1_000 && count === 1 ? "mil" : `${upToThousand(count)} ${count === 1 ? singular : plural}`, amount: count * size });
      rest %= size;
    }
  }
  if (rest) groups.push({ words: upToThousand(rest), amount: rest });
  return groups.reduce((text, group, index) => {
    if (index === 0) return group.words;
    // O último grupo leva "e" quando é menor que cem ou é centena redonda: "mil e cem", "mil e vinte".
    const last = index === groups.length - 1;
    const joiner = last && (group.amount < 100 || group.amount % 100 === 0) ? " e " : ", ";
    return text + joiner + group.words;
  }, "");
}

export function centsToWords(cents: number): string {
  const reais = Math.floor(Math.abs(cents) / 100);
  const centavos = Math.abs(cents) % 100;
  // "de reais" depois de milhão ou bilhão redondo: "um milhão de reais".
  const reaisWord = reais === 1 ? "real" : reais >= 1_000_000 && reais % 1_000_000 === 0 ? "de reais" : "reais";
  const parts: string[] = [];
  if (reais) parts.push(`${numberToWords(reais)} ${reaisWord}`);
  if (centavos) parts.push(`${numberToWords(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return parts.length ? parts.join(" e ") : "zero real";
}
