"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE = "Há alterações que ainda não foram salvas. Sair mesmo assim e perdê-las?";

/**
 * Enquanto houver alteração não salva, pede confirmação antes de sair da tela: ao fechar ou
 * recarregar a aba (aviso do navegador) e ao clicar num link do próprio site (o App Router não
 * tem como bloquear a navegação, então o clique é interceptado antes de chegar ao Link).
 */
export function useUnsavedChangesWarning(dirty: boolean, message: string = DEFAULT_MESSAGE): void {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Navegadores antigos só mostram o aviso com returnValue preenchido.
      event.returnValue = "";
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      // Outro site já cai no aviso do navegador; o mesmo endereço (âncora) não sai da tela.
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    // Fase de captura no document: roda antes do onClick do Link, que o React liga mais abaixo.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
