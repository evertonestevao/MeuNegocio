import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseStorageProvider, withPublicOrigin } from "@/adapters/storage/supabaseStorageProvider";
import { getClientEnv } from "@/config/env";
import { createSupabaseCompanyLogoRepository } from "@/repositories/supabase/companyLogoRepository";
import { createCompanyLogoService, type CompanyLogoService } from "@/services/companyLogoService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";

const COMPANY_LOGOS_BUCKET = "company-logos";
/** Logo da demonstração: arquivo do próprio site, sem bucket. */
const DEMO_LOGO_PREFIX = "demo/";

export async function getCompanyLogoService(): Promise<CompanyLogoService> {
  // service_role no arquivo: o bucket não tem policy de escrita; o service confere o papel antes.
  const storage = createSupabaseStorageProvider(getSupabaseAdminClient(), COMPANY_LOGOS_BUCKET);
  return createCompanyLogoService({
    repo: createSupabaseCompanyLogoRepository(await getSupabaseServerClient()),
    files: {
      upload: async (path, content, contentType) => {
        await storage.upload({ path, content, contentType });
      },
      remove: (path) => storage.remove(path),
    },
    newId: randomUUID,
  });
}

/**
 * Link público do logo para os documentos. Sem I/O: montado pelo endereço do Supabase, porque o
 * client de service_role só resolve a chamada quando ela é aguardada (ver supabase-admin.ts).
 */
export function companyLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith(DEMO_LOGO_PREFIX)) return `/${path}`;
  const base = getClientEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const url = `${base}/storage/v1/object/public/${COMPANY_LOGOS_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return withPublicOrigin(url, process.env.STORAGE_PUBLIC_ORIGIN);
}
