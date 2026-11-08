/**
 * Types das linhas do banco (espelham supabase/migrations).
 * Fonte única — não redeclarar essas interfaces em outros arquivos.
 */

import type { QuotePaymentPlan } from "./finance";
import type { SimplesAnnex } from "./tax";

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
  /** Criada pelo cadastro em etapas: o nome é provisório até a pessoa preencher os dados essenciais. */
  onboarding_pending: boolean;
  /** Suspensa pelo super admin (fraude, denúncia): sem acesso ao painel e sem link de orçamento. */
  suspended_at?: string | null;
  suspension_reason?: string | null;
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
  /** Texto livre do super admin, exibido na oferta do plano. */
  custom_text: string | null;
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

export interface ClientPickerOption {
  id: string;
  name: string;
  /** CPF ou CNPJ, para achar o cliente pelo número também. */
  document?: string | null;
  locations: { id: string; name: string }[];
}

/** Regime tributário para o imposto estimado do serviço. */
export type TaxRegime = "mei" | "simples" | "other";

/** Empresa no cabeçalho dos documentos que vão para o cliente (orçamento, ordem de serviço, recibo). */
export interface DocumentCompany {
  name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Link público do logo; null sem logo enviado. */
  logoUrl: string | null;
}

export interface CompanyProfile {
  company_id: string;
  /** Logo no bucket público company-logos: <company_id>/<uuid>.png. */
  logo_path?: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  quote_validity_days: number;
  quote_default_notes: string | null;
  timezone: string;
  /** Margem que a empresa considera boa, em %. Abaixo dela o resultado aparece em alerta. */
  target_margin_percent?: number;
  /** Regime para o imposto estimado do serviço; null é não informado. */
  tax_regime?: TaxRegime | null;
  /** Alíquota padrão em centésimos de ponto percentual (8,43% = 843). */
  tax_rate_bps?: number;
  /** Simples Nacional: alíquota calculada pelo RBT12 no lugar de tax_rate_bps. */
  tax_rate_auto?: boolean;
  simples_annex?: SimplesAnnex | null;
  fator_r?: boolean;
  activity_started_on?: string | null;
  /** Simples Nacional pelo regime de caixa: o RBT12 soma o recebido. */
  tax_cash_basis?: boolean;
  card_fee_credit_bps?: number;
  card_fee_debit_bps?: number;
}

/**
 * Subconjunto não sensível do perfil, liberado a qualquer membro (inclusive o
 * técnico) para a ordem de serviço e o cabeçalho dos documentos. Sem imposto,
 * taxa de cartão ou margem — ver get_company_doc_profile.
 */
export type CompanyDocProfile = Pick<
  CompanyProfile,
  "company_id" | "logo_path" | "cnpj" | "phone" | "email" | "address" | "timezone" | "quote_validity_days" | "quote_default_notes"
>;

export type CatalogKind = "product" | "service";
export type PricingMode = "fixed" | "hourly";

export interface CatalogItem {
  id: string;
  company_id: string;
  kind: CatalogKind;
  name: string;
  description: string | null;
  unit: string;
  pricing_mode: PricingMode;
  price_cents: number;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Só preenchido parao proprietário e ao administrador; a tabela de custos é restrita a eles. */
  cost_cents: number | null;
}

export type QuoteStatus = "draft" | "sent" | "approved" | "refused" | "expired" | "closed" | "canceled";

export interface Quote {
  id: string;
  company_id: string;
  number: number;
  client_id: string | null;
  location_id: string | null;
  title: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  discount_cents: number;
  subtotal_cents: number;
  total_cents: number;
  notes: string | null;
  public_token: string;
  sent_at: string | null;
  approved_at: string | null;
  refused_at: string | null;
  canceled_at?: string | null;
  closed_at: string | null;
  /** Alíquota congelada na aprovação; null segue a da empresa. */
  tax_rate_bps?: number | null;
  /** Condições de pagamento combinadas; null é "a combinar". */
  payment_plan?: QuotePaymentPlan | null;
  created_at: string;
  updated_at: string;
}

/** Um registro do histórico do orçamento (vem da auditoria). */
export interface QuoteHistoryEntry {
  action: string;
  created_at: string;
  /** Quem fez no sistema; null quando foi o cliente pelo link ou o próprio sistema. */
  user_name: string | null;
  metadata: { requested_by?: string; note?: string; automatic?: boolean; source_quote_id?: string } & Record<string, unknown>;
}

/** Aberturas do link pelo cliente (sem a própria empresa nem robôs de prévia). */
export interface QuoteView {
  first_viewed_at: string;
  last_viewed_at: string;
  view_count: number;
}

export interface QuoteListItem extends Quote {
  client_name: string | null;
  view: QuoteView | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  sort_order: number;
  description: string;
  unit: string;
  pricing_mode: PricingMode;
  quantity: number;
  people: number;
  unit_price_cents: number;
  line_total_cents: number;
  /** Custo do item neste orçamento. Só chega para owner e admin; o cliente nunca vê. */
  cost_cents?: number | null;
}

export interface QuoteResponse {
  id: string;
  quote_id: string;
  decision: "approved" | "refused";
  name: string;
  comment: string | null;
  /** Assinatura de quem aprovou pelo link, no bucket privado quote-signatures. */
  signature_path?: string | null;
  created_at: string;
}

export interface Revenue {
  id: string;
  quote_id: string;
  amount_cents: number;
  competence_date: string;
}

export type ContractType = "clt" | "pj" | "freelancer";

export interface Employee {
  id: string;
  company_id: string;
  name: string;
  job_title: string | null;
  active: boolean;
  user_id: string | null;
}

/** Só o proprietário e o administrador leem. */
export interface EmployeePaymentDetails {
  employee_id: string;
  phone: string | null;
  contract_type: ContractType;
  hourly_cost_cents: number;
  hourly_pay_cents: number;
  legal_name: string | null;
  tax_id: string | null;
  pix_key: string | null;
}

export interface EmployeeListItem extends Employee {
  /** Null para quem não é owner nem admin. */
  details: EmployeePaymentDetails | null;
  next_visit: { visit_date: string; starts_at: string; client_name: string } | null;
  upcoming_count: number;
}

export type VisitKind = "assessment" | "execution";
export type VisitStatus = "scheduled" | "in_progress" | "completed" | "canceled";

export interface Visit {
  id: string;
  company_id: string;
  client_id: string;
  location_id: string;
  quote_id: string | null;
  kind: VisitKind;
  visit_date: string;
  starts_at: string;
  ends_at: string;
  status: VisitStatus;
  notes: string | null;
  /** Lista só deste atendimento. Nula: usa o modelo da empresa. */
  checklist_labels?: string[] | null;
}

export interface VisitListItem extends Visit {
  client_name: string;
  location_name: string;
  employees: { id: string; name: string }[];
}

export interface VisitBusySlot {
  visit_id: string;
  employee_id: string;
  visit_date: string;
  starts_at: string;
  ends_at: string;
  client_name: string;
}

export interface QuotePickerOption {
  id: string;
  number: number;
  title: string | null;
  client_id: string;
  location_id: string | null;
  status: QuoteStatus;
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
  /** Preços do plano na contratação, gravados pelo banco: editar o plano não os altera. */
  contracted_price_cents: number;
  contracted_extra_seat_price_cents: number;
  /** false: compra parcelada, sem renovação. Vale até current_period_end. */
  renews: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SignupStage = "contact" | "account" | "done";

/** Conclusão da conferência do CNPJ na base pública. */
export type CnpjCheckResult = "match" | "name_mismatch" | "inactive" | "not_found" | "unavailable";

/** Cadastro em etapas: nome, e-mail e aceite guardados já na primeira tela (tabela da plataforma). */
export interface SignupLead {
  id: string;
  email: string;
  full_name: string;
  stage: SignupStage;
  terms_version_id: string | null;
  accepted_at: string;
  email_consent: boolean;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Declaração de responsabilidade pela empresa, guardada como prova (só inclusão). */
export interface CompanyDeclaration {
  id: string;
  company_id: string;
  user_id: string | null;
  user_name: string;
  user_email: string;
  company_name: string;
  cnpj: string | null;
  statement: string;
  terms_version_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  declared_at: string;
}

export interface CompanyCnpjCheck {
  id: string;
  company_id: string;
  cnpj: string;
  informed_name: string;
  result: CnpjCheckResult;
  official_name: string | null;
  trade_name: string | null;
  situation: string | null;
  opened_on: string | null;
  city: string | null;
  state: string | null;
  declarant_in_partners: boolean | null;
  source: string;
  checked_at: string;
}

export interface AbuseReport {
  id: string;
  company_id: string | null;
  quote_id: string | null;
  company_name: string | null;
  reason: "impersonation" | "suspicious_charge" | "other";
  message: string;
  reporter_name: string | null;
  reporter_contact: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface CompanySuspensionEvent {
  id: string;
  company_id: string;
  action: "suspended" | "reactivated";
  reason: string;
  actor_id: string | null;
  actor_email: string;
  created_at: string;
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
