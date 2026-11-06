"use client";

import { Building2, CreditCard, UserPlus } from "lucide-react";
import { AppShell, type AppShellProps } from "@/components/app-shell/app-shell";
import type { ShellNavItem } from "@/components/app-shell/nav-items";

const NAV: ShellNavItem[] = [
  { title: "Empresas", href: "/admin/empresas", icon: Building2 },
  { title: "Cadastros", href: "/admin/cadastros", icon: UserPlus },
  { title: "Planos", href: "/admin/planos", icon: CreditCard },
];

// Ícones são funções: a lista precisa nascer no client, não vir do layout de servidor.
export function PlansShell(props: Omit<AppShellProps, "area">) {
  return <AppShell {...props} area={{ home: NAV[0], items: NAV }} />;
}
