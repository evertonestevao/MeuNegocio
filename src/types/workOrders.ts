import type { VisitKind, VisitStatus } from "./database";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface WorkOrder {
  id: string;
  status: "in_progress" | "completed";
  checklist: ChecklistItem[];
  report: string | null;
  started_time: string;
  finished_time: string | null;
  signature_path: string | null;
  signature_name: string | null;
  signed_at: string | null;
  photos: { id: string; path: string; caption: string | null }[];
}

/** O que quem vai a campo enxerga da visita: sem documento nem observações do cliente. */
export interface VisitSheet {
  id: string;
  company_id: string;
  kind: VisitKind;
  visit_date: string;
  starts_at: string;
  ends_at: string;
  status: VisitStatus;
  notes: string | null;
  is_mine: boolean;
  client_name: string;
  location: { name: string; address: string; notes: string | null };
  contact: { name: string; role: string | null; phone: string | null } | null;
  team: string[];
  work_order: WorkOrder | null;
}
