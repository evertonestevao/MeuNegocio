import "server-only";
import { cookies } from "next/headers";
import { DEMO_COOKIE, DEMO_READ_ONLY_MESSAGE, type DemoProfile } from "@/config/demo";
import { AppError } from "@/lib/errors";

/** Perfil da demonstração na request atual, ou null. Fora de uma request, nunca é demonstração. */
export async function getDemoProfile(): Promise<DemoProfile | null> {
  try {
    const value = (await cookies()).get(DEMO_COOKIE)?.value;
    return value === "owner" || value === "technician" ? value : null;
  } catch {
    return null;
  }
}

/** Trava para o que sai do sistema sem passar pelo banco, como o gateway de pagamento. */
export async function rejectInDemo(): Promise<void> {
  if (await getDemoProfile()) throw new AppError("forbidden", DEMO_READ_ONLY_MESSAGE);
}
