"use server";

import { DEMO_QUOTE_TOKEN, DEMO_READ_ONLY_MESSAGE } from "@/config/demo";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { closeQuoteSchema, publicResponseSchema, quoteSchema } from "@/features/quotes/schemas";
import { AppError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { taxRatePercentSchema } from "@/lib/tax";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { getActor } from "@/server/actor";
import { recordAudit } from "@/server/audit";
import { getPublicQuoteService, getQuoteNotificationService, getQuoteService } from "@/server/quotes";
import { reportError } from "@/adapters/errorReporting";
import { getServiceCostService } from "@/server/serviceCosts";
import { createRateLimiter } from "@/server/rateLimit";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { createAuditService } from "@/services/auditService";
import type { QuoteTransition } from "@/services/quoteService";
import { toActionError, type ActionState } from "./action-state";

function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dados inválidos." };
  return toActionError(err);
}

function quoteIdFrom(formData: FormData): string {
  const parsed = z.uuid().safeParse(formData.get("quoteId"));
  if (!parsed.success) throw new AppError("validation_error", "Orçamento inválido");
  return parsed.data;
}

function refresh(quoteId?: string): void {
  revalidatePath("/dashboard/quotes");
  revalidatePath("/dashboard/services");
  if (quoteId) revalidatePath(`/dashboard/quotes/${quoteId}`);
}

export async function saveQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let createdId: string | null = null;
  try {
    const actor = await getActor();
    const input = quoteSchema.parse(JSON.parse(String(formData.get("payload") ?? "{}")));
    const existingId = formData.get("quoteId") ? quoteIdFrom(formData) : null;
    const service = await getQuoteService();
    const quoteId = await service.save(actor, existingId, input);
    await recordAudit({
      companyId: actor.companyId,
      action: existingId ? "quote.updated" : "quote.created",
      entityType: "quote",
      entityId: quoteId,
    });
    refresh(quoteId);
    if (existingId) return { success: "Orçamento salvo" };
    createdId = quoteId;
  } catch (err) {
    return handleError(err);
  }
  redirect(`/dashboard/quotes/${createdId}`);
}

const TRANSITIONS: Record<QuoteTransition, string> = {
  send: "Orçamento marcado como enviado",
  approve: "Orçamento marcado como aprovado",
  refuse: "Orçamento marcado como recusado",
  expire: "Orçamento marcado como expirado",
  reopen: "Orçamento reaberto como rascunho",
};

export async function transitionQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const quoteId = quoteIdFrom(formData);
    const action = z.enum(["send", "approve", "refuse", "expire", "reopen"]).parse(formData.get("action"));
    const validUntil = formData.get("validUntil") ? z.iso.date("Informe a nova validade.").parse(formData.get("validUntil")) : null;
    const service = await getQuoteService();
    await service.transition(actor, quoteId, action, validUntil);
    await recordAudit({ companyId: actor.companyId, action: `quote.${action}`, entityType: "quote", entityId: quoteId });
    refresh(quoteId);
    return { success: TRANSITIONS[action] };
  } catch (err) {
    return handleError(err);
  }
}

export async function closeQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const quoteId = quoteIdFrom(formData);
    const input = closeQuoteSchema.parse({
      amountCents: parseMoneyToCents(String(formData.get("amount") ?? "")) ?? undefined,
      competenceDate: formData.get("competenceDate"),
      installments: JSON.parse(String(formData.get("installments") ?? "[]")),
    });
    const service = await getQuoteService();
    await service.close(actor, quoteId, input);
    await recordAudit({
      companyId: actor.companyId,
      action: "quote.closed",
      entityType: "quote",
      entityId: quoteId,
      metadata: { amount_cents: input.amountCents, competence_date: input.competenceDate, installments: input.installments.length },
    });
    refresh(quoteId);
    return { success: "Orçamento fechado e lançado no faturamento" };
  } catch (err) {
    return handleError(err);
  }
}

export async function undoCloseQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const quoteId = quoteIdFrom(formData);
    const service = await getQuoteService();
    await service.undoClose(actor, quoteId);
    await recordAudit({ companyId: actor.companyId, action: "quote.close_undone", entityType: "quote", entityId: quoteId });
    refresh(quoteId);
    return { success: "Fechamento desfeito" };
  } catch (err) {
    return handleError(err);
  }
}

export async function duplicateQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let newId: string;
  try {
    const actor = await getActor();
    const quoteId = quoteIdFrom(formData);
    const service = await getQuoteService();
    newId = await service.duplicate(actor, quoteId);
    await recordAudit({
      companyId: actor.companyId,
      action: "quote.duplicated",
      entityType: "quote",
      entityId: newId,
      metadata: { source_quote_id: quoteId },
    });
    refresh();
  } catch (err) {
    return handleError(err);
  }
  redirect(`/dashboard/quotes/${newId}`);
}

export async function deleteQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const quoteId = quoteIdFrom(formData);
    const service = await getQuoteService();
    await service.remove(actor, quoteId);
    await recordAudit({ companyId: actor.companyId, action: "quote.deleted", entityType: "quote", entityId: quoteId });
    refresh();
  } catch (err) {
    return handleError(err);
  }
  redirect("/dashboard/quotes");
}

const publicLimiter = () => createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

/** Resposta do cliente pelo link. Sem sessão: o token é a credencial, e a escrita é do servidor. */
export async function respondPublicQuoteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    if (DEMO_QUOTE_TOKEN.test(String(formData.get("token")))) return { error: DEMO_READ_ONLY_MESSAGE };

    const token = z.string().regex(/^[0-9a-f]{64}$/).safeParse(formData.get("token"));
    if (!token.success) throw new AppError("not_found", "Orçamento não encontrado");

    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
    await publicLimiter().consume(`public-quote:${ip}`);

    const { decision, name, comment } = publicResponseSchema.parse({
      decision: formData.get("decision"),
      name: formData.get("name"),
      comment: formData.get("comment") ?? "",
    });

    const signature = formData.get("signature");
    const { companyId, quoteId } = await getPublicQuoteService().respond(token.data, {
      decision,
      name,
      comment,
      signature: signature instanceof File && signature.size > 0 ? new Uint8Array(await signature.arrayBuffer()) : null,
    });
    await createAuditService(createSupabaseAuditRepository(getSupabaseAdminClient())).record({
      companyId,
      userId: null,
      action: decision === "approved" ? "quote.approved_by_client" : "quote.refused_by_client",
      entityType: "quote",
      entityId: quoteId,
      metadata: {},
    });
    // Melhor-esforço: o cliente já respondeu; falha de e-mail fica só no monitoramento.
    await getQuoteNotificationService()
      .notifyResponse({ companyId, quoteId, decision, name, comment })
      .catch((err) => reportError(err, { source: "quote-response-email" }));
    refresh(quoteId);
    revalidatePath(`/orcamento/${token.data}`);
    return { success: decision === "approved" ? "Orçamento aprovado" : "Resposta registrada" };
  } catch (err) {
    return handleError(err);
  }
}

/** Alíquota do imposto estimado deste serviço, no lugar do padrão da empresa. */
export async function setServiceTaxRateAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await getActor();
    const quoteId = quoteIdFrom(formData);
    const rateBps = taxRatePercentSchema.parse(String(formData.get("taxRate") ?? ""));
    await (await getServiceCostService()).setTaxRate(actor, quoteId, rateBps);
    await recordAudit({
      companyId: actor.companyId,
      action: "quote.tax_rate_changed",
      entityType: "quote",
      entityId: quoteId,
      metadata: { tax_rate_bps: rateBps },
    });
    refresh(quoteId);
    revalidatePath("/dashboard/finance");
    return { success: "Imposto do serviço salvo" };
  } catch (err) {
    return handleError(err);
  }
}
