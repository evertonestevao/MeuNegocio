/** iPhone e iPad não oferecem instalação automática: é preciso explicar o caminho no Safari. */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  // O iPad se apresenta como Mac, mas Mac não tem tela de toque.
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** O script que decide a entrada roda antes da tela pintar: uma vez por abertura do aplicativo. */
export const SPLASH_SCRIPT =
  "try{if(sessionStorage.getItem('pwa-splash'))document.documentElement.classList.add('pwa-splash-seen');else sessionStorage.setItem('pwa-splash','1')}catch(e){}";
