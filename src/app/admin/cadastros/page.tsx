import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { createSupabaseSignupLeadRepository } from "@/repositories/supabase/signupLeadRepository";
import { getPlatformAdminId } from "@/server/plans";
import { getSupabaseServerClient } from "@/server/supabase-server";
import type { SignupStage } from "@/types/database";

export const metadata: Metadata = { title: "Cadastros" };

const RECENT = 100;

const STAGE: Record<SignupStage, { label: string; tone: "secondary" | "outline" | "default" }> = {
  contact: { label: "Parou antes da senha", tone: "secondary" },
  account: { label: "Criou a conta, falta assinar ou completar a empresa", tone: "outline" },
  done: { label: "Concluiu", tone: "default" },
};

/** Quem começou o cadastro pelo site. Lido com a sessão do super admin: a RLS só libera para ele. */
export default async function SignupLeadsAdminPage() {
  if (!(await getPlatformAdminId())) redirect("/dashboard");
  const leads = await createSupabaseSignupLeadRepository(await getSupabaseServerClient()).listRecent(RECENT);
  const pending = leads.filter((lead) => lead.stage !== "done").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Cadastros</h1>
        <p className="text-sm text-muted-foreground">
          Quem deixou nome e e-mail no site. Os dados são apagados sozinhos 90 dias depois da última atualização.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{pending === 1 ? "1 cadastro sem concluir" : `${pending} cadastros sem concluir`}</CardTitle>
          <CardDescription>Os mais recentes primeiro. Quem parou no meio pode receber um contato seu.</CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém começou o cadastro ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {leads.map((lead) => (
                <li key={lead.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium break-words">{lead.full_name}</span>
                    <a href={`mailto:${lead.email}`} className="break-all text-muted-foreground hover:text-foreground">
                      {lead.email}
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge variant={STAGE[lead.stage].tone}>{STAGE[lead.stage].label}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDate(lead.updated_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
