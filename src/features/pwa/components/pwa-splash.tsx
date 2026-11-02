import { brand } from "@/config/brand";
import { SPLASH_SCRIPT } from "../platform";

/**
 * Entrada do aplicativo instalado. Só CSS: aparece antes do JavaScript carregar, some sozinha e
 * não bloqueia toques. No navegador comum nunca é exibida (ver .pwa-splash em globals.css).
 */
export function PwaSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      <div className="pwa-splash" aria-hidden="true">
        <svg className="pwa-splash-logo" viewBox="0 0 100 100">
          <rect width="100" height="100" rx="22" fill="#f0b429" />
          <path d="M22 76V24h15l13 24 13-24h15v52H63V49L50 72 37 49v27z" fill="#17222f" />
        </svg>
        <p className="pwa-splash-name">{brand.name}</p>
        <p className="pwa-splash-tagline">{brand.tagline}</p>
        <span className="pwa-splash-bar" />
      </div>
    </>
  );
}
