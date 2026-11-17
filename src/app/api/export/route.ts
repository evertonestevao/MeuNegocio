import { NextResponse } from "next/server";
import { reportError } from "@/adapters/errorReporting";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import { rejectInDemo } from "@/server/demo/mode";
import { buildCompanyExport } from "@/server/export/companyExport";
import { createRateLimiter } from "@/server/rateLimit";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

const limiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

/** Baixar uma cópia dos dados da empresa ativa. Só o proprietário, mesmo sem assinatura ativa (direito aos dados). */
export async function GET(): Promise<Response> {
  try {
    await rejectInDemo();
    const { active } = await getActiveTenant();
    if (!active || !permissionService.canManageBilling(active.role)) {
      return NextResponse.json({ error: "Só o proprietário pode baixar os dados." }, { status: 403 });
    }
    await limiter.consume(`export:${active.id}`);

    const { zip, counts } = await buildCompanyExport(active.id);
    await recordAudit({ companyId: active.id, action: "data.exported", entityType: "company", entityId: active.id, metadata: { counts } });

    const day = new Date().toISOString().slice(0, 10);
    return new Response(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="meus-dados-${day}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError && err.code === "rate_limited") {
      return NextResponse.json({ error: "Muitos downloads seguidos. Tente de novo mais tarde." }, { status: 429 });
    }
    if (err instanceof AppError && err.code === "forbidden") {
      return NextResponse.json({ error: "Não permitido." }, { status: 403 });
    }
    await reportError(err, { source: "route:/api/export" });
    return NextResponse.json({ error: "Não foi possível exportar." }, { status: 500 });
  }
}
