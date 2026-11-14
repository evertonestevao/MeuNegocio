"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/actor";
import { getFirstStepsService } from "@/server/home";
import { rejectInDemo } from "@/server/demo/mode";
import { toActionError, type ActionState } from "./action-state";

/** "Não mostrar mais" no cartão de primeiros passos: guarda na empresa, some em qualquer aparelho. */
export async function dismissFirstStepsAction(): Promise<ActionState> {
  try {
    await rejectInDemo();
    const actor = await getActor();
    await (await getFirstStepsService()).dismiss(actor);
    revalidatePath("/dashboard");
    return { success: "Pronto, não mostramos mais os primeiros passos." };
  } catch (err) {
    return toActionError(err);
  }
}
