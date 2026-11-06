/** Partes do nome que não identificam ninguém: tipo de empresa e ligações ("de", "&"). */
const IGNORED = new Set(["ltda", "me", "mei", "epp", "eireli", "sa", "s/a", "s.a.", "ss", "s/s", "cia", "de", "da", "do", "das", "dos", "e", "em", "&", "-"]);

/**
 * Iniciais para avatar: primeira e última palavra que contam. "Academia Corpo em Ação Ltda" vira
 * "AA", não "AL"; "Carlos Eduardo Ferreira", "CF". Sem palavra que conte, usa as que houver.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !IGNORED.has(word.toLowerCase()));
  const pool = meaningful.length > 0 ? meaningful : words;
  if (pool.length === 0) return "?";
  const first = pool[0][0];
  const last = pool.length > 1 ? pool[pool.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}
