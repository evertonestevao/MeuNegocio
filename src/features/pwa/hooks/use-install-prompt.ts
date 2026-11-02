"use client";

import { useEffect, useState } from "react";
import { isIosDevice } from "../platform";

const DISMISS_KEY = "pwa-install-dismissed";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallMode = "hidden" | "prompt" | "ios";

/** Estado da oferta de instalação: não aparece para quem já instalou ou dispensou. */
export function useInstallPrompt() {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Sem armazenamento, a oferta só volta a aparecer na próxima visita.
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (dismissed || standalone) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) queueMicrotask(() => setMode("ios"));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    mode,
    async install() {
      if (!promptEvent) return;
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      setPromptEvent(null);
      if (outcome === "accepted") setMode("hidden");
    },
    dismiss() {
      setMode("hidden");
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // Sem armazenamento, a oferta só volta a aparecer na próxima visita.
      }
    },
  };
}
