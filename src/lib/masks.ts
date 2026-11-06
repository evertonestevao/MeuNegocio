/** Máscaras e formatos brasileiros. Puros: valem no navegador, no servidor e nos PDFs. */

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function applyPattern(digits: string, groups: number[], separators: string[]): string {
  let result = "";
  let position = 0;
  groups.forEach((size, index) => {
    const part = digits.slice(position, position + size);
    if (!part) return;
    if (index > 0) result += separators[index - 1];
    result += part;
    position += size;
  });
  return result;
}

export function maskCnpj(value: string): string {
  return applyPattern(digitsOnly(value).slice(0, 14), [2, 3, 3, 4, 2], [".", ".", "/", "-"]);
}

export function maskCpf(value: string): string {
  return applyPattern(digitsOnly(value).slice(0, 11), [3, 3, 3, 2], [".", ".", "-"]);
}

/** Até 11 dígitos é CPF; a partir daí, CNPJ. */
export function maskCpfCnpj(value: string): string {
  return digitsOnly(value).length <= 11 ? maskCpf(value) : maskCnpj(value);
}

/** Telefone com DDD, fixo ou celular. O DDI 55 colado junto é descartado. */
export function maskPhone(value: string): string {
  let digits = digitsOnly(value);
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const local = digits.slice(2);
  const prefixSize = digits.length === 11 ? 5 : 4;
  const prefix = local.slice(0, prefixSize);
  const line = local.slice(prefixSize);
  return `(${digits.slice(0, 2)}) ${prefix}${line ? `-${line}` : ""}`;
}

/**
 * Valor enquanto é digitado: "1234,5" vira "1.234,5". O que a pessoa digitou não muda de
 * grandeza: "150" continua sendo cento e cinquenta reais.
 */
export function maskMoney(value: string): string {
  // "149.90" colado de outro lugar é decimal; "1.234" é milhar.
  const text = /^\d+\.\d{1,2}$/.test(value.trim()) ? value.trim().replace(".", ",") : value;
  const commaAt = text.indexOf(",");
  const whole = digitsOnly(commaAt === -1 ? text : text.slice(0, commaAt)).replace(/^0+(?=\d)/, "").slice(0, 10);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (commaAt === -1) return grouped;
  return `${grouped || "0"},${digitsOnly(text.slice(commaAt + 1)).slice(0, 2)}`;
}

/** Fecha o valor ao sair do campo: "150" vira "150,00". Vazio continua vazio. */
export function finishMoney(value: string): string {
  const masked = maskMoney(value);
  if (!masked) return "";
  const [whole, fraction = ""] = masked.split(",");
  return `${whole},${fraction.padEnd(2, "0")}`;
}

export function isValidPhone(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === 10 || digits.length === 11;
}

/** CNPJ com 14 dígitos e dígitos verificadores certos. Sequência repetida (000…, 111…) não vale. */
export function isValidCnpj(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const check = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const rest = [...base].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = check(digits.slice(0, 12));
  const second = check(digits.slice(0, 12) + first);
  return digits.endsWith(`${first}${second}`);
}

/** Para exibir: telefone conhecido ganha a máscara; outro formato volta como veio. */
export function formatPhone(value: string): string {
  return isValidPhone(value) ? maskPhone(value) : value;
}

/** Para exibir: CPF ou CNPJ com pontuação; outro formato volta como veio. */
export function formatDocument(value: string): string {
  const size = digitsOnly(value).length;
  return size === 11 || size === 14 ? maskCpfCnpj(value) : value;
}
