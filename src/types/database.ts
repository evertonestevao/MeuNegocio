/**
 * Types das linhas do banco (espelham supabase/migrations).
 * Fonte única — não redeclarar essas interfaces em outros arquivos.
 */

export type RoleCode = "owner" | "admin" | "member" | "technician";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type BillingInterval = "month" | "year";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  /** NULL se quem criou excluiu a conta. */
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: RoleCode;
  invited_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  email: string;
  role: RoleCode;
  /** NULL se quem convidou excluiu a conta. */
  invited_by: string | null;
  token: string;
  status: InviteStatus;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  billing_interval: BillingInterval;
  /** Limites e flags do plano, ex.: { max_members: 5, hours: true }; limite null é ilimitado */
  features: Record<string, unknown>;
  /** Preço mensal (centavos) por seat além de features.max_members; 0 = não vende extra. */
  extra_seat_price_cents: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  company_id: string;
  name: string;
  document: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientListItem extends Client {
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  location_count: number;
}

export interface ClientContact {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientLocation {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  address: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanAuditEntry {
  id: string;
  plan_id: string;
  action: "created" | "updated" | "activated" | "deactivated";
  changed_by: string | null;
  changed_by_name: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
  changed_at: string;
}

export interface Subscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** IDs do gateway são neutros — nunca colunas stripe_* no schema. */
  external_subscription_id: string | null;
  external_customer_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermsVersion {
  id: string;
  version: number;
  content: string;
  published_at: string;
  is_current: boolean;
}

export interface TermsAcceptance {
  id: string;
  user_id: string;
  terms_version_id: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/** Finalidades de consentimento LGPD. Novas finalidades: migration + aqui. */
export type ConsentType = "email_communications";

export interface UserConsent {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  granted: boolean;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface Setting {
  id: string;
  company_id: string;
  key: string;
  value: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
