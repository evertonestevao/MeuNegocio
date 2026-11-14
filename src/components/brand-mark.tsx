/**
 * Símbolo da marca: o "N" do NegocioApp com a perna direita em seta para cima
 * (ideia de negócio crescendo), num quadrado arredondado. É o MESMO desenho dos
 * ícones do PWA — ao alterar, rode `node scripts/generate-pwa-icons.mjs` para
 * manter ícone instalado, favicon e splash iguais. O tamanho vem de className.
 */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-hidden>
      <rect width="100" height="100" rx="22" fill="var(--sidebar-primary)" />
      <path d="M22 28h14l26 32V36h-9l16-20 16 20h-9v44H62L36 48v28H22z" fill="var(--sidebar)" />
    </svg>
  );
}
