import "server-only";
import { headers } from "next/headers";
import { createSupabaseTermsRepository } from "@/repositories/supabase/termsRepository";
import { createTermsService, type RequestEvidence, type TermsService } from "@/services/termsService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

export async function getTermsService(): Promise<TermsService> {
  const client = await getSupabaseServerClient();
  return createTermsService(createSupabaseTermsRepository(client, getSupabaseAdminClient()));
}

/** IP e user-agent da request atual — evidência LGPD do aceite. */
export async function getRequestEvidence(): Promise<RequestEvidence> {
  const headerList = await headers();
  // Atrás da Cloudflare, cf-connecting-ip é definido por ela; o x-forwarded-for pode trazer um
  // primeiro item inventado pelo cliente, o que burlaria o limite por endereço do cadastro.
  const forwardedFor = headerList.get("x-forwarded-for");
  return {
    ipAddress: headerList.get("cf-connecting-ip")?.trim() || forwardedFor?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null,
    userAgent: headerList.get("user-agent"),
  };
}
