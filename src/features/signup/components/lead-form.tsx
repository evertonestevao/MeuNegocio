"use client";

import Link from "next/link";
import { Gift, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/features/auth/components/auth-form";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { startSignupAction } from "@/server/actions/signup";

export interface LeadFormValues {
  fullName: string;
  email: string;
  emailConsent: boolean;
}

/**
 * Primeiro passo: nome, e-mail e aceite. Tudo é guardado ao continuar; o plano vem no passo seguinte.
 * Quem volta do passo da senha para corrigir encontra o que já tinha preenchido.
 */
export function LeadForm({ trialDays, initial }: { trialDays: number; initial?: LeadFormValues }) {
  return (
    <AuthForm action={startSignupAction} submitLabel="Continuar">
      <p className="flex gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <Gift className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <span>
          <strong className="font-semibold">Os primeiros {trialDays} dias são grátis.</strong>{" "}
          <span className="text-muted-foreground">Escolha o plano no próximo passo. Se cancelar nesse período, não paga nada.</span>
        </span>
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Seu nome</Label>
        <Input id="fullName" name="fullName" autoComplete="name" minLength={2} maxLength={120} defaultValue={initial?.fullName} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" maxLength={254} defaultValue={initial?.email} required />
      </div>
      {/* Campo isca: invisível para pessoas, robôs costumam preencher. */}
      <div className="absolute -left-[9999px] size-px overflow-hidden" aria-hidden>
        <label htmlFor="website">Site</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p role="note" className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <strong className="font-medium text-foreground">Guardamos seu nome e e-mail a partir daqui</strong>, para você continuar de onde parou
          e para falarmos com você sobre o cadastro. Se não concluir, apagamos em 90 dias.{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4">
            Saiba mais
          </Link>
        </span>
      </p>
      <TermsCheckboxes accepted={Boolean(initial)} emailConsent={initial?.emailConsent} />
    </AuthForm>
  );
}
