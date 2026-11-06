import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, ChevronRight, ClipboardList, CreditCard, Percent, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountDataSection } from "@/features/account/components/account-data-section";
import { CompanyLogoField } from "@/features/company/components/company-logo-field";
import { CompanyProfileForm } from "@/features/company/components/company-profile-form";
import { AcceptInviteButton } from "@/features/companies/components/accept-invite-button";
import {
  CompanyNameForm,
  LeaveCompanyButton,
  ProfileForm,
} from "@/features/companies/components/settings-forms";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getAccountService } from "@/server/account";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { companyLogoUrl } from "@/server/companyLogo";
import { getCompanyProfileService } from "@/server/quotes";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createInviteService } from "@/services/inviteService";
import { createUserService } from "@/services/userService";
import { permissionService } from "@/services/permissionService";
import { roleLabel } from "@/config/roles";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const client = await getSupabaseServerClient();
  const account = await getAccountService();
  const [profile, myInvites, deletionPlan] = await Promise.all([
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    createInviteService({
      repo: createSupabaseInviteRepository(client),
      rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
    }).listMyPending(),
    account.getDeletionPlan(),
  ]);

  const canEditCompany = permissionService.canEditCompany(active.role);
  const companyProfile = canEditCompany ? await (await getCompanyProfileService()).get(active.id) : null;
  const isOwner = active.role === "owner";
  const companyLinks = [
    ...(canEditCompany
      ? [{ href: "/dashboard/settings/checklists", title: "Checklists", description: "Itens padrão de cada tipo de visita", icon: ClipboardList }]
      : []),
    ...(permissionService.canManageFinance(active.role)
      ? [{ href: "/dashboard/settings/impostos", title: "Impostos e taxas", description: "Imposto e taxas do cartão descontados do resultado dos serviços", icon: Percent }]
      : []),
    ...(permissionService.canManageBilling(active.role)
      ? [{ href: "/dashboard/billing", title: "Assinatura", description: "Plano, vagas e pagamentos", icon: CreditCard }]
      : []),
    ...(permissionService.canViewAudit(active.role)
      ? [{ href: "/dashboard/audit", title: "Auditoria", description: "Histórico do que foi feito na empresa", icon: ScrollText }]
      : []),
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Seu perfil e a empresa ativa</p>
      </div>

      {/* Convites endereçados a MIM (outras empresas me chamando). */}
      {myInvites.length > 0 ? (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" />
              Convites pendentes para você
              <Badge>{myInvites.length}</Badge>
            </CardTitle>
            <CardDescription>
              Você foi convidado para outras empresas. Aceite para entrar nelas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {myInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{invite.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    papel: {roleLabel(invite.role)} · expira em{" "}
                    {new Date(invite.expires_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="ml-auto w-full sm:w-auto">
                  <AcceptInviteButton token={invite.token} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {companyLinks.length > 0 ? (
        <Card className="py-0">
          <ul className="flex flex-col divide-y">
            {companyLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
                    <item.icon className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Como seu nome aparece para colegas de empresa</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initialName={profile?.full_name ?? ""} />
        </CardContent>
      </Card>

      {canEditCompany ? (
        <Card>
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>Dados de {active.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyNameForm />
          </CardContent>
        </Card>
      ) : null}

      {companyProfile ? (
        <Card>
          <CardHeader>
            <CardTitle>Dados para orçamentos</CardTitle>
            <CardDescription>Aparecem no PDF e no link de aprovação.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <CompanyLogoField initialUrl={companyLogoUrl(companyProfile.logo_path)} />
            <CompanyProfileForm profile={companyProfile} />
          </CardContent>
        </Card>
      ) : null}

      {!isOwner ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Zona de perigo</CardTitle>
            <CardDescription>
              Você perde o acesso aos dados desta empresa ao sair.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveCompanyButton />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <CardDescription>Exportação e exclusão da sua conta (LGPD)</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountDataSection
            blockers={deletionPlan.blockers}
            companiesToClose={deletionPlan.companiesToClose.map((c) => c.companyName)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
