/**
 * IP do cliente para chave de rate limit. Puro: recebe os headers e não faz I/O.
 *
 * Atrás da Cloudflare, cf-connecting-ip é definido por ela e não é falsificável
 * pelo visitante. O PRIMEIRO item de x-forwarded-for é escolhido pelo cliente e
 * não serve de chave (trocar o header driblaria o limite por endereço). Fora da
 * CF (dev ou outro proxy), cai para x-real-ip ou o ÚLTIMO salto do XFF, que é o
 * que o proxy mais próximo viu, não o que o cliente alegou.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) ?? "desconhecido";
}
