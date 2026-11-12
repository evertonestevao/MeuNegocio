"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useTenant } from "@/providers/tenant-provider";
import { Breadcrumbs } from "./breadcrumbs";
import { CompanySwitcher } from "./company-switcher";
import { InstallBanner } from "@/features/pwa/components/install-banner";
import { MobileNav } from "./mobile-nav";
import { isSettingsSubpage, navItems, type NavItem, type ShellNavItem } from "./nav-items";
import { UserMenu, type UserMenuProps } from "./user-menu";

/** Cookie lido pelo layout server para SSR sem "flash" do estado colapsado. */
export const SIDEBAR_COOKIE = "sidebar-collapsed";

export interface AppShellProps extends UserMenuProps {
  initialCollapsed: boolean;
  /** Mostra "Nova empresa" no seletor. Fechado para quem não é super admin. */
  canCreateCompany?: boolean;
  /** Área fora dos tenants (painel, vendedor): sem seletor de empresa, com menu próprio. */
  area?: { home: ShellNavItem; items: ShellNavItem[] };
  /** Convites pendentes PARA o usuário — badge de atenção em Configurações. */
  pendingInvitesCount?: number;
  children: React.ReactNode;
}

/**
 * Shell do app: no desktop (lg+), sidebar fixa com modo rail persistido em cookie;
 * abaixo de lg, abas embaixo e "Mais". Os dois usam os mesmos itens de nav-items.
 */
export function AppShell({
  initialCollapsed,
  canCreateCompany = false,
  area,
  pendingInvitesCount = 0,
  children,
  ...user
}: AppShellProps) {
  const homeHref = area?.home.href ?? "/dashboard";
  const nav = (collapsed: boolean) =>
    area ? (
      <SidebarNav collapsed={collapsed} pathname={pathname} items={area.items} />
    ) : (
      <TenantSidebarNav collapsed={collapsed} pathname={pathname} pendingInvitesCount={pendingInvitesCount} />
    );

  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();

  function toggleCollapsed() {
    setCollapsed((current) => {
      document.cookie = `${SIDEBAR_COOKIE}=${!current}; path=/; max-age=31536000; samesite=lax`;
      return !current;
    });
  }

  return (
    <div className="flex min-h-svh w-full bg-app-canvas">
      {/* Sidebar desktop: some abaixo de lg; colapsa para rail de ícones. */}
      <aside
        data-collapsed={collapsed}
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r print:hidden border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", collapsed && "px-2 justify-center")}>
          <Link href={homeHref} className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
            <BrandMark className="size-8" />
            {collapsed ? null : <span className="truncate">{brand.name}</span>}
          </Link>
        </div>
        {nav(collapsed)}
        <div className="mt-auto border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            className={cn(
              "w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              !collapsed && "justify-start gap-2",
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {collapsed ? null : <span>Recolher</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 print:hidden items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground lg:border-border lg:bg-background/95 lg:text-foreground lg:backdrop-blur">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <BrandMark className="size-8" />
            <span className="truncate font-heading text-lg font-bold tracking-tight">{brand.name}</span>
          </Link>
          <div className="hidden min-w-0 lg:block">
            <Breadcrumbs pathname={pathname} items={area?.items} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {area ? null : <CompanySwitcher canCreate={canCreateCompany} />}
            <div className="hidden lg:block">
              <UserMenu {...user} />
            </div>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none lg:p-8">
          <InstallBanner />
          {children}
        </main>
      </div>
      {/* Na impressão (comprovantes do admin), só o conteúdo. */}
      <div className="print:hidden">
      {area ? (
        <MobileNav
          tabs={area.items.slice(0, 4)}
          more={area.items.slice(4)}
          isActive={(item) => pathname === item.href}
          areaLinks={user.areaLinks}
        />
      ) : (
        <TenantMobileNav pathname={pathname} pendingInvitesCount={pendingInvitesCount} areaLinks={user.areaLinks} />
      )}
      </div>
    </div>
  );
}

function TenantMobileNav({
  pathname,
  pendingInvitesCount,
  areaLinks,
}: {
  pathname: string;
  pendingInvitesCount: number;
  areaLinks: UserMenuProps["areaLinks"];
}) {
  const { active } = useTenant();
  const items: NavItem[] = navItems.filter((item) => item.roles.includes(active.role));
  return (
    <MobileNav
      tabs={items.filter((item) => item.mobileTab)}
      more={items.filter((item) => !item.mobileTab)}
      isActive={(item) => isNavItemActive(item.href, pathname)}
      pendingInvitesCount={pendingInvitesCount}
      areaLinks={areaLinks}
    />
  );
}

function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/dashboard/settings" && isSettingsSubpage(pathname));
}

function TenantSidebarNav({
  pendingInvitesCount,
  ...props
}: {
  collapsed: boolean;
  pathname: string;
  pendingInvitesCount: number;
}) {
  const { active } = useTenant();
  return (
    <SidebarNav
      {...props}
      pendingInvitesCount={pendingInvitesCount}
      items={navItems.filter((item) => item.roles.includes(active.role))}
    />
  );
}

function SidebarNav({
  collapsed,
  pathname,
  items,
  pendingInvitesCount = 0,
}: {
  collapsed: boolean;
  pathname: string;
  items: ShellNavItem[];
  pendingInvitesCount?: number;
}) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href === "/dashboard/settings" && isSettingsSubpage(pathname));
        // Badge de atenção: convites pendentes para o usuário, em Configurações.
        const badgeCount = item.href === "/dashboard/settings" ? pendingInvitesCount : 0;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-2",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {collapsed ? <span className="sr-only">{item.title}</span> : <span>{item.title}</span>}
            {badgeCount > 0 ? (
              collapsed ? (
                <span
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive"
                  aria-label={`${badgeCount} convite(s) pendente(s)`}
                />
              ) : (
                <span
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-white"
                  aria-label={`${badgeCount} convite(s) pendente(s)`}
                >
                  {badgeCount}
                </span>
              )
            ) : null}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href}>
            <TooltipTrigger render={link} />
            <TooltipContent side="right">{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}
