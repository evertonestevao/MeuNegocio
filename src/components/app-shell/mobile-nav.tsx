"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { ChevronRight, LogOut, Moon, MoreHorizontal, Sun } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";
import type { ShellNavItem } from "./nav-items";
import type { UserMenuProps } from "./user-menu";

const SHEET_ROW = "flex min-h-12 w-full items-center gap-3 rounded-xl bg-muted/60 px-4 text-sm font-medium";

/**
 * Navegação do celular (abaixo de lg): abas fixas embaixo e "Mais" com o restante.
 * Recebe os mesmos itens da sidebar, filtrados por papel; não tem lista própria.
 */
export function MobileNav({
  tabs,
  more,
  isActive,
  pendingInvitesCount = 0,
  areaLinks = [],
}: {
  tabs: ShellNavItem[];
  more: ShellNavItem[];
  isActive(item: ShellNavItem): boolean;
  pendingInvitesCount?: number;
  areaLinks?: UserMenuProps["areaLinks"];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [, startTransition] = useTransition();
  const moreActive = more.some(isActive);
  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
      active ? "text-foreground" : "text-muted-foreground",
    );
  const marker = <span className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-sidebar-primary" aria-hidden />;

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {tabs.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item) ? "page" : undefined} className={tabClass(isActive(item))}>
            <item.icon className="size-5" aria-hidden />
            <span className="max-w-full truncate px-0.5">{item.title}</span>
            {isActive(item) ? marker : null}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)} className={tabClass(moreActive)}>
          <span className="relative">
            <MoreHorizontal className="size-5" aria-hidden />
            {pendingInvitesCount > 0 ? <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-destructive" aria-label={`${pendingInvitesCount} convite(s) pendente(s)`} /> : null}
          </span>
          Mais
          {moreActive ? marker : null}
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] gap-0 rounded-t-3xl p-0 lg:hidden">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-lg font-bold">Mais opções</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {more.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={SHEET_ROW}>
                <item.icon className="size-5 text-primary" aria-hidden />
                <span className="flex-1">{item.title}</span>
                {item.href === "/dashboard/settings" && pendingInvitesCount > 0 ? (
                  <span className="inline-flex min-w-5 justify-center rounded-full bg-destructive px-1.5 text-xs text-white">{pendingInvitesCount}</span>
                ) : null}
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ))}
            {areaLinks.map((link) => (
              <button
                key={link.href}
                type="button"
                className={SHEET_ROW}
                onClick={() => {
                  setOpen(false);
                  router.push(link.href);
                }}
              >
                <span className="flex-1 text-left">{link.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            ))}
            <button type="button" className={SHEET_ROW} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun className="size-5 text-primary" aria-hidden /> : <Moon className="size-5 text-primary" aria-hidden />}
              {resolvedTheme === "dark" ? "Modo claro" : "Modo escuro"}
            </button>
            <button type="button" className={cn(SHEET_ROW, "text-destructive")} onClick={() => startTransition(() => signOutAction())}>
              <LogOut className="size-5" aria-hidden />
              Sair
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
