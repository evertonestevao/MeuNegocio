import "server-only";
import { createSupabaseEmployeeRepository } from "@/repositories/supabase/employeeRepository";
import { createSupabaseVisitRepository } from "@/repositories/supabase/visitRepository";
import { createEmployeeService, type EmployeeService } from "@/services/employeeService";
import { createVisitService, type VisitService } from "@/services/visitService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getEmployeeService(): Promise<EmployeeService> {
  return createEmployeeService(createSupabaseEmployeeRepository(await getSupabaseServerClient()));
}

export async function getVisitService(): Promise<VisitService> {
  return createVisitService(createSupabaseVisitRepository(await getSupabaseServerClient()));
}
