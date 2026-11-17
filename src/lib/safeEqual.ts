import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara dois textos sem vazar, pelo tempo de resposta, em que posição eles diferem. Os dois passam
 * por SHA-256 antes, porque `timingSafeEqual` exige tamanhos iguais e o tamanho do segredo não deve
 * aparecer. Serve para segredos de rotinas e webhooks.
 */
export function safeEqual(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
