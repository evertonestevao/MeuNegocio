import "server-only";
import { AppError } from "@/lib/errors";
import { getActiveTenant } from "./tenant";

export interface ActorContext {
  companyId: string;
  role: string;
}

/** A empresa vem sempre da sessão no servidor, nunca do formulário. */
export async function getActor(): Promise<ActorContext> {
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("forbidden", "Nenhuma empresa ativa");
  return { companyId: active.id, role: active.role };
}
