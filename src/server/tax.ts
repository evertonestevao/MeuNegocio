import "server-only";
import { createSupabaseTaxRepository } from "@/repositories/supabase/taxRepository";
import { createTaxService, type TaxService } from "@/services/taxService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getTaxService(): Promise<TaxService> {
  return createTaxService(createSupabaseTaxRepository(await getSupabaseServerClient()));
}
