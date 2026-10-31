import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { planOfferLines } from "@/config/planFeatures";
import { benefits, faq, hero, journey, pains } from "@/features/marketing/content";
import { formatCents } from "@/lib/money";
import { getPublicPlans } from "@/server/plans";
import type { Plan } from "@/types/database";

// Preço e oferta mudam pelo painel, sem deploy: a página não pode ficar presa ao build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} — ${brand.tagline}` },
  description: hero.description,
};

function PlanCard({ plan, featured }: { plan: Plan; featured: boolean }) {
  return (
    <Card className={featured ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {plan.price_cents === 0 ? "Grátis" : formatCents(plan.price_cents, plan.currency)}
          {plan.price_cents === 0 ? null : <span className="text-sm font-normal text-muted-foreground"> /mês</span>}
        </p>
        {plan.extra_seat_price_cents > 0 ? (
          <p className="text-sm text-muted-foreground">Membro extra: {formatCents(plan.extra_seat_price_cents, plan.currency)} /mês</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <ul className="flex flex-col gap-2 text-sm">
          {planOfferLines(plan.features).map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <Button className="mt-auto" variant={featured ? "default" : "outline"} nativeButton={false} render={<Link href="/signup" />}>
          {plan.price_cents === 0 ? "Começar grátis" : `Começar com ${plan.name}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function LandingPage() {
  const plans = await getPublicPlans();
  const paid = plans.filter((plan) => plan.price_cents > 0);
  const featuredId = paid[0]?.id;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <span className="font-semibold tracking-tight">{brand.name}</span>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Principal">
            <a href="#como-funciona" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">
              Como funciona
            </a>
            <a href="#planos" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">
              Planos
            </a>
            <a href="#duvidas" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">
              Dúvidas
            </a>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
              Entrar
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
              Criar conta
            </Button>
          </nav>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        <section className="bg-sidebar text-sidebar-foreground">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-24">
            <div className="flex min-w-0 flex-col items-start gap-6">
              <h1 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl">{hero.title}</h1>
              <p className="max-w-xl text-pretty text-sidebar-foreground/80 lg:text-lg">{hero.description}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  nativeButton={false}
                  render={<a href="#planos" />}
                >
                  Ver planos
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:bg-transparent"
                  nativeButton={false}
                  render={<a href="#como-funciona" />}
                >
                  Como funciona
                </Button>
              </div>
            </div>

            {/* O caminho de um serviço: é o produto em uma coluna, sem números de exemplo. */}
            <ol className="flex min-w-0 flex-col" aria-label="O caminho de um serviço">
              {journey.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                      {index + 1}
                    </span>
                    {index < journey.length - 1 ? <span className="w-px flex-1 bg-sidebar-border" aria-hidden /> : null}
                  </div>
                  <div className="min-w-0 pb-5">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm text-sidebar-foreground/75">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Se a sua empresa roda no WhatsApp e no caderno</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {pains.map((pain) => (
              <div key={pain.title} className="flex flex-col gap-2 border-t-2 border-sidebar-primary pt-4">
                <h3 className="font-medium">{pain.title}</h3>
                <p className="text-sm text-muted-foreground">{pain.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-14 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">O que o {brand.name} faz</h2>
            <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="flex flex-col gap-2">
                  <benefit.icon className="size-5" aria-hidden />
                  <h3 className="font-medium">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="mx-auto w-full max-w-6xl scroll-mt-14 px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Planos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pagamento por PIX, boleto ou cartão. Técnico com login conta como membro; pessoa da equipe sem login, não.</p>
          {plans.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">
              Não foi possível mostrar os planos agora. Fale com {brand.legal.supportEmail}.
            </p>
          ) : (
            <div className="mt-8 grid items-stretch gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} featured={plan.id === featuredId} />
              ))}
            </div>
          )}
        </section>

        <section id="duvidas" className="scroll-mt-14 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-3xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Dúvidas frequentes</h2>
            <div className="mt-6 flex flex-col divide-y">
              {faq.map((item) => (
                <details key={item.question} className="group py-4">
                  <summary className="cursor-pointer font-medium">{item.question}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.answer}
                    {item.question.startsWith("Como funciona o pagamento") ? (
                      <>
                        {" "}
                        <Link href="/refund" className="underline underline-offset-4">
                          Ler a política de reembolso
                        </Link>
                        .
                      </>
                    ) : null}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Documentos legais">
            <Link href="/terms" className="hover:text-foreground">
              Termos de Uso
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/refund" className="hover:text-foreground">
              Reembolso
            </Link>
          </nav>
          <p>
            {brand.legal.companyName} · CNPJ {brand.legal.cnpj} · {brand.legal.address}
          </p>
          <p>
            Suporte: {brand.legal.supportEmail} · Encarregado de dados: {brand.legal.dpoEmail}
          </p>
        </div>
      </footer>
    </div>
  );
}
