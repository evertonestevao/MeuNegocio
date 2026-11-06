import { reportError } from "@/adapters/errorReporting";
import { DEMO_READ_ONLY_CODE, DEMO_READ_ONLY_MESSAGE } from "@/config/demo";
import { isAppError, type AppErrorCode } from "@/lib/errors";

/** Estado devolvido pelas server actions aos forms (useActionState). */
export interface ActionState {
  error?: string;
  success?: string;
  /** Mensagem de cada campo com problema, pelo name do campo, para mostrar junto dele. */
  fieldErrors?: Record<string, string>;
}

/** Primeira mensagem de cada campo, a partir dos problemas do Zod. */
export function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

/** Códigos que indicam falha nossa ou de provedor — vão ao monitoramento. */
const REPORTABLE_CODES: ReadonlySet<AppErrorCode> = new Set([
  "internal_error",
  "payment_error",
  "email_error",
]);

/** Converte erro em ActionState seguro (nunca vaza detalhe interno). */
export function toActionError(err: unknown): ActionState {
  if (isAppError(err)) {
    // Na demonstração, toda escrita é recusada de propósito: não é falha a reportar.
    if ((err.internal as { code?: string } | undefined)?.code === DEMO_READ_ONLY_CODE || err.message === DEMO_READ_ONLY_MESSAGE) {
      return { error: DEMO_READ_ONLY_MESSAGE };
    }
    if (REPORTABLE_CODES.has(err.code)) {
      void reportError(err, { source: "action" });
    }
    return { error: err.message };
  }
  void reportError(err, { source: "action" });
  return { error: "Erro interno. Tente novamente." };
}
