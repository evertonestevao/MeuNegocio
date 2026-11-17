import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AttentionList } from "@/features/admin-overview/components/attention-list";
import { OverviewTiles } from "@/features/admin-overview/components/overview-tiles";
import { getAdminOverview } from "@/server/adminOverview";
import { getPlatformAdminId } from "@/server/plans";

export const metadata: Metadata = { title: "Visão geral" };

/** Porta de entrada do super admin: o negócio em números e o que precisa da atenção dele. */
export default async function AdminOverviewPage() {
  if (!(await getPlatformAdminId())) redirect("/dashboard");
  const overview = await getAdminOverview();
  const updatedAt = new Date(overview.generatedAt).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">O negócio em números e o que pede a sua atenção. Atualizado em {updatedAt}.</p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="indicadores">
        <h2 id="indicadores" className="text-sm font-semibold text-muted-foreground">
          Indicadores
        </h2>
        <OverviewTiles tiles={overview.tiles} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="atencao">
        <h2 id="atencao" className="text-sm font-semibold text-muted-foreground">
          Precisa da sua atenção
        </h2>
        <AttentionList items={overview.attention} />
      </section>
    </div>
  );
}
