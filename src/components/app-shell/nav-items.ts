import {
  BookOpen,
  Clock,
  Wallet,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  HardHat,
  CreditCard,
  FileText,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { RoleCode } from "@/types/database";

/** Navegação da sidebar — editar aqui ao adicionar módulos do seu produto. */

/** Item de navegação de qualquer área do shell. */
export interface ShellNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavItem extends ShellNavItem {
  /** Papéis que veem o item (autorização real fica no server/RLS). */
  roles: RoleCode[];
}

export const navItems: NavItem[] = [
  {
    title: "Início",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "member"],
  },
  { title: "Minhas visitas", href: "/dashboard/my-visits", icon: ClipboardCheck, roles: ["technician"] },
  { title: "Agenda", href: "/dashboard/schedule", icon: CalendarDays, roles: ["owner", "admin", "member"] },
  { title: "Orçamentos", href: "/dashboard/quotes", icon: FileText, roles: ["owner", "admin", "member"] },
  { title: "Clientes", href: "/dashboard/clients", icon: Building2, roles: ["owner", "admin", "member"] },
  { title: "Catálogo", href: "/dashboard/catalog", icon: BookOpen, roles: ["owner", "admin", "member"] },
  { title: "Equipe", href: "/dashboard/team", icon: HardHat, roles: ["owner", "admin", "member"] },
  { title: "Horas", href: "/dashboard/hours", icon: Clock, roles: ["owner", "admin"] },
  { title: "Gastos", href: "/dashboard/expenses", icon: Wallet, roles: ["owner", "admin"] },
  { title: "Financeiro", href: "/dashboard/finance", icon: ChartColumn, roles: ["owner", "admin"] },
  { title: "Membros", href: "/dashboard/members", icon: Users, roles: ["owner", "admin"] },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard, roles: ["owner"] },
  { title: "Auditoria", href: "/dashboard/audit", icon: ScrollText, roles: ["owner", "admin"] },
  {
    title: "Configurações",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["owner", "admin", "member", "technician"],
  },
];

/** Título da página atual a partir do pathname (breadcrumb/header mobile). */
export function titleForPath(pathname: string, items: ShellNavItem[] = navItems): string {
  if (pathname.startsWith("/dashboard/work-orders")) return "Ordem de serviço";
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.title ?? items[0]?.title ?? "Dashboard";
}
