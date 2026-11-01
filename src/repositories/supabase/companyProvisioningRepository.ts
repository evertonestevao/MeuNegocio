import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CompanyProvisioningRepository } from "@/services/companyProvisioningService";

/** Exige o client service_role: criar usuário e empresa para outra pessoa não passa pela RLS. */
export function createSupabaseCompanyProvisioningRepository(admin: SupabaseClient): CompanyProvisioningRepository {
  return {
    async createOwner({ email, fullName, password }) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, must_change_password: true },
      });
      if (error || !data.user) {
        if (error?.code === "email_exists" || /already/i.test(error?.message ?? "")) {
          throw new AppError("conflict", "Já existe uma conta com este e-mail.", error);
        }
        throw new AppError("internal_error", "Falha ao criar o acesso do responsável", error);
      }
      return data.user.id;
    },

    async deleteOwner(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new AppError("internal_error", "Falha ao desfazer o acesso criado", error);
    },

    async createCompany({ name, slug, ownerId, planId, actorId }) {
      const { error } = await admin.rpc("admin_create_company", {
        p_name: name,
        p_slug: slug,
        p_owner: ownerId,
        p_plan_id: planId,
        p_actor: actorId,
      });
      if (!error) return;
      if (error.code === "23505") throw new AppError("conflict", "Já existe uma empresa com esse identificador", error);
      if (error.code === "P0002") throw new AppError("validation_error", "Escolha um plano à venda.", error);
      throw new AppError("internal_error", "Falha ao criar a empresa", error);
    },
  };
}
