"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";
import { followsUserTheme } from "@/config/theme";

/**
 * Tema dark/light via classe no <html> (tokens em globals.css). Fora do sistema logado, o claro é
 * forçado: a escolha da pessoa continua guardada e volta ao entrar no painel.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname();
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={followsUserTheme(pathname) ? undefined : "light"} {...props}>
      {children}
    </NextThemesProvider>
  );
}
