import Link from "next/link";
import { brand } from "@/config/brand";

const TAGLINE = "Da visita técnica ao caixa, sem nada se perder no caminho.";
const GLOW = "bg-[radial-gradient(ellipse_80%_60%_at_100%_100%,color-mix(in_oklch,var(--sidebar-primary)_12%,transparent),transparent)]";

/**
 * Gráfico só de fundo, quase transparente: lembra um painel de resultados sem disputar atenção com
 * a frase. Sem números nem rótulos, para não parecer dado de verdade.
 */
function BackdropChart() {
  const bars = [28, 36, 31, 44, 40, 52, 47, 60, 56, 68, 64, 78];
  return (
    <svg
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-2/3 w-full text-sidebar-foreground [mask-image:linear-gradient(to_right,transparent_10%,black_70%)] lg:block"
      aria-hidden
    >
      <g opacity="0.05" fill="currentColor">
        {bars.map((height, index) => (
          <rect key={index} x={18 + index * 48} y={400 - height * 4} width="22" height={height * 4} rx="4" />
        ))}
      </g>
      <g stroke="currentColor" strokeOpacity="0.045">
        {[100, 180, 260, 340].map((y) => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} strokeDasharray="4 8" />
        ))}
      </g>
      <polyline
        points={bars.map((height, index) => `${29 + index * 48},${400 - height * 4 - 26}`).join(" ")}
        fill="none"
        stroke="var(--sidebar-primary)"
        strokeOpacity="0.18"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {bars.map((height, index) =>
        index % 3 === 2 ? <circle key={index} cx={29 + index * 48} cy={400 - height * 4 - 26} r="4" fill="var(--sidebar-primary)" fillOpacity="0.22" /> : null,
      )}
    </svg>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:min-h-svh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* No computador, painel só com a marca e uma frase. No celular, cabeçalho compacto. */}
      <aside className="relative flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className={`pointer-events-none absolute inset-0 ${GLOW}`} aria-hidden />
        <div className="pointer-events-none absolute -right-48 -bottom-48 hidden size-[36rem] rounded-full border border-sidebar-primary/20 lg:block" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -bottom-24 hidden size-[24rem] rounded-full border border-sidebar-primary/30 lg:block" aria-hidden />
        <BackdropChart />
        <div className="relative flex flex-col gap-2 px-6 py-6 lg:h-full lg:justify-between lg:p-14">
          <Link href="/" className="flex w-fit items-center gap-2.5 font-heading text-2xl font-extrabold tracking-tight">
            <svg viewBox="0 0 100 100" className="size-9 shrink-0 lg:size-10" aria-hidden>
              <rect width="100" height="100" rx="22" fill="var(--sidebar-primary)" />
              <path d="M22 76V24h15l13 24 13-24h15v52H63V49L50 72 37 49v27z" fill="var(--sidebar)" />
            </svg>
            {brand.name}
          </Link>
          <p className="max-w-md text-sm text-sidebar-foreground/75 lg:hidden">{TAGLINE}</p>
          <div className="lp-enter hidden max-w-xl flex-col gap-6 lg:flex">
            <span className="h-1 w-12 rounded-full bg-sidebar-primary" aria-hidden />
            <p className="text-5xl leading-[1.08] font-semibold tracking-tight text-balance xl:text-6xl">{TAGLINE}</p>
          </div>
        </div>
      </aside>

      <main
        id="conteudo"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-6 py-10 outline-none lg:items-center lg:px-12 [&_input:not([type=checkbox],[type=hidden])]:h-11 [&_[data-slot=button][type=submit]]:h-11"
      >
        <div className="lp-enter w-full max-w-md [&>[data-slot=card]]:gap-6 [&>[data-slot=card]]:overflow-visible [&>[data-slot=card]]:border-0 [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:py-0 [&>[data-slot=card]]:shadow-none [&>[data-slot=card]]:ring-0 [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-description]]:text-base [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-title]]:text-3xl [&_[data-slot=card-title]]:font-semibold [&_[data-slot=card-title]]:tracking-tight">
          {children}
        </div>
      </main>
    </div>
  );
}
