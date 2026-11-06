import "server-only";
import { getServerEnv } from "@/config/env";
import { createBrasilApiRegistry } from "./brasilApiRegistry";
import type { CompanyRegistry } from "./CompanyRegistry";
import { createFakeRegistry } from "./fakeRegistry";

export type { CompanyLookup, CompanyRecord, CompanyRegistry } from "./CompanyRegistry";

/** Fonte da consulta de CNPJ, escolhida por COMPANY_REGISTRY (env de servidor). */
export function getCompanyRegistry(): CompanyRegistry {
  switch (getServerEnv().COMPANY_REGISTRY) {
    case "brasilapi":
      return createBrasilApiRegistry({ userAgent: `saas-starterkit/1.0 (+${getServerEnv().APP_URL})` });
    case "fake":
      return createFakeRegistry();
  }
}
