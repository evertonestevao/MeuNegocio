import { brand } from "@/config/brand";

/**
 * Símbolo da marca: a inicial do nome num quadrado arredondado. Usa a inicial de
 * `brand.name`, então acompanha a troca de nome sem precisar editar o desenho.
 * O tamanho vem de className. (Para um logo próprio, trocar o conteúdo do <svg>.)
 */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-hidden>
      <rect width="100" height="100" rx="22" fill="var(--sidebar-primary)" />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-heading"
        fontSize="60"
        fontWeight="800"
        fill="var(--sidebar)"
      >
        {brand.name.slice(0, 1).toUpperCase()}
      </text>
    </svg>
  );
}
