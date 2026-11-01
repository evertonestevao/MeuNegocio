import { redirect } from "next/navigation";
import { PlansShell } from "@/features/plans/components/plans-shell";
import { getAreaLinks, getAreaShellProps } from "@/modules/resellers/areaAccess";
import { getPlatformAdminId } from "@/server/plans";

export default async function PlansAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getPlatformAdminId())) redirect("/dashboard");
  const [shell, areaLinks] = await Promise.all([getAreaShellProps(), getAreaLinks()]);

  return (
    <PlansShell
      {...shell}
      areaLinks={[
        ...areaLinks.filter((link) => link.href !== "/admin/planos" && link.href !== "/admin/empresas"),
        { href: "/dashboard", label: "Área do cliente" },
      ]}
    >
      {children}
    </PlansShell>
  );
}
