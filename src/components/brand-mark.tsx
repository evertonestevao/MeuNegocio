/** Símbolo da marca (o "M" no quadrado). O tamanho vem de className. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-hidden>
      <rect width="100" height="100" rx="22" fill="var(--sidebar-primary)" />
      <path d="M22 76V24h15l13 24 13-24h15v52H63V49L50 72 37 49v27z" fill="var(--sidebar)" />
    </svg>
  );
}
