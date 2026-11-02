"use client";

import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { useInstallPrompt } from "../hooks/use-install-prompt";

/** Oferta discreta de instalar o aplicativo, só no celular. */
export function InstallBanner() {
  const { mode, install, dismiss } = useInstallPrompt();
  if (mode === "hidden") return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-sidebar p-3 text-sidebar-foreground shadow-xs lg:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-bold">Instale o {brand.name}</p>
        {mode === "ios" ? (
          <p className="text-xs text-sidebar-foreground/80">
            No Safari, toque em <Share className="inline size-3.5 align-text-bottom" aria-label="Compartilhar" /> e depois em &quot;Adicionar à Tela de Início&quot;.
          </p>
        ) : (
          <p className="text-xs text-sidebar-foreground/80">Abra direto da tela inicial, como um aplicativo.</p>
        )}
      </div>
      {mode === "prompt" ? (
        <Button size="sm" className="shrink-0 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" onClick={() => void install()}>
          Instalar
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-sm" className="shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Dispensar instalação" onClick={dismiss}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
