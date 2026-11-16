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
          <path d="M22 28h14l26 32V36h-9l16-20 16 20h-9v44H62L36 48v28H22z" fill="#17222f" />
        </svg>
        <p className="pwa-splash-name">{brand.name}</p>
        <p className="pwa-splash-tagline">{brand.splashTagline}</p>
        <span className="pwa-splash-bar" />
      </div>
    </>
  );
}
