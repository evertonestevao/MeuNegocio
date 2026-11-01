import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brand, salesWhatsappHref } from "@/config/brand";
import { annualSavingsCents, planMonthlyCents, planOfferLines, plansForSale } from "@/config/planFeatures";
import { BrowserFrame, PhoneFrame } from "@/features/marketing/components/device-frames";
import { SampleCharts } from "@/features/marketing/components/sample-charts";
import { benefits, faq, hero, journey, pains, showcases } from "@/features/marketing/content";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPublicPlans } from "@/server/plans";
import { isSignupOpen } from "@/server/signup";
import type { Plan } from "@/types/database";

// Preço e oferta mudam pelo painel, sem deploy: a página não pode ficar presa ao build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} — ${brand.tagline}` },
  description: hero.description,
};

const YELLOW_BUTTON = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90";

function PlanCard({ plan, savingsCents, signupOpen }: { plan: Plan; savingsCents: number; signupOpen: boolean }) {
  const annual = plan.billing_interval === "year";
  // O card não se move: animar aqui pode tirar o botão de compra de baixo do clique.
  return (
    <Card className={cn("transition-shadow hover:shadow-md", annual && "relative overflow-visible border-2 border-sidebar-primary shadow-xl")}>
      <CardHeader>
        {annual ? (
          <span className="absolute -top-3 left-4 rounded-full bg-sidebar-primary px-3 py-0.5 text-xs font-semibold text-sidebar-primary-foreground">
            Melhor escolha
          </span>
        ) : null}
        <CardTitle>{plan.name}</CardTitle>
        <p className={cn("font-semibold tracking-tight tabular-nums", annual ? "text-4xl" : "text-3xl")}>
          {annual ? <span className="text-lg font-medium">12x de </span> : null}
          {formatCents(planMonthlyCents(plan), plan.currency)}
          {annual ? null : <span className="text-sm font-normal text-muted-foreground"> /mês</span>}
        </p>
        <p className="text-sm text-muted-foreground">
          {annual
            ? `No cartão, total de ${formatCents(plan.price_cents, plan.currency)}. Vale por 12 meses, sem renovação automática.`
            : "Cobrado todo mês, por PIX, boleto ou cartão"}
        </p>
        {annual && savingsCents > 0 ? (
          <p className="w-fit rounded-full bg-success/12 px-2.5 py-0.5 text-sm font-medium text-success dark:bg-success/20">
            Economize {formatCents(savingsCents, plan.currency)} por ano
          </p>
        ) : null}
        {plan.extra_seat_price_cents > 0 ? (
          <p className="text-sm text-muted-foreground">
            Membro extra: {formatCents(planMonthlyCents(plan, plan.extra_seat_price_cents), plan.currency)} /mês
          </p>
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
        {plan.custom_text ? <p className="whitespace-pre-line text-sm text-muted-foreground">{plan.custom_text}</p> : null}
        <Button
          className={cn("mt-auto", annual && YELLOW_BUTTON)}
          variant={annual ? "default" : "outline"}
          nativeButton={false}
          render={signupOpen ? <Link href="/signup" /> : <a href={salesWhatsappHref(`Olá! Quero contratar o plano ${plan.name} do ${brand.name}.`)} target="_blank" rel="noreferrer" />}
        >
          {signupOpen ? `Começar com o plano ${plan.name}` : `Quero o plano ${plan.name}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function LandingPage() {
  const plans = plansForSale(await getPublicPlans());
  const savingsCents = annualSavingsCents(plans);
  const signupOpen = isSignupOpen();

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <span className="font-semibold tracking-tight">{brand.name}</span>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Principal">
            <a href="/demo" className="hidden px-2 text-sm font-medium text-foreground hover:underline md:block">
              Demonstração
            </a>
            <a href="#telas" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">
              Telas
            </a>
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
            <Button size="sm" nativeButton={false} render={signupOpen ? <Link href="/signup" /> : <a href={salesWhatsappHref(`Olá! Quero contratar o ${brand.name}.`)} target="_blank" rel="noreferrer" />}>
              {signupOpen ? "Criar conta" : "Quero contratar"}
            </Button>
          </nav>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        <section className="relative bg-sidebar pb-40 text-sidebar-foreground sm:pb-56 lg:pb-72">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,color-mix(in_oklch,var(--sidebar-primary)_24%,transparent),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 pt-16 text-center lg:pt-24">
            <p className="lp-enter rounded-full border border-sidebar-border px-3 py-1 text-sm text-sidebar-foreground/85">{hero.eyebrow}</p>
            <h1 style={{ "--lp-delay": "80ms" } as React.CSSProperties} className="lp-enter text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{hero.title}</h1>
            <p style={{ "--lp-delay": "160ms" } as React.CSSProperties} className="lp-enter max-w-2xl text-pretty text-sidebar-foreground/80 lg:text-lg">{hero.description}</p>
            <div style={{ "--lp-delay": "240ms" } as React.CSSProperties} className="lp-fade flex flex-wrap justify-center gap-3">
              <Button size="lg" className={YELLOW_BUTTON} nativeButton={false} render={<a href="#planos" />}>
                Ver planos <ArrowRight className="size-4 motion-safe:transition-transform motion-safe:group-hover/button:translate-x-0.5" aria-hidden />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:bg-transparent"
                nativeButton={false}
                render={<a href="/demo" />}
              >
                Ver demonstração
              </Button>
            </div>
            <ul style={{ "--lp-delay": "320ms" } as React.CSSProperties} className="lp-enter flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-sidebar-foreground/80">
              {hero.highlights.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-sidebar-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="relative z-10 mx-auto -mt-32 w-full max-w-6xl px-4 sm:-mt-48 lg:-mt-64">
          <div style={{ "--lp-delay": "400ms" } as React.CSSProperties} className="lp-enter relative lg:mr-16">
            {/* No celular, a tela de computador ficaria pequena demais para ler. */}
            <BrowserFrame
              src="/landing/inicio.jpg"
              alt="Tela de início com as visitas de hoje, os orçamentos em andamento, o saldo do mês e as contas a pagar."
              sizes="(max-width: 1200px) 100vw, 1100px"
              preload
              className="hidden sm:block"
            />
            <PhoneFrame
              src="/landing/inicio-celular.jpg"
              alt="Tela de início no celular, com as visitas de hoje, o saldo do mês e as contas a pagar."
              sizes="260px"
              className="mx-auto w-64 sm:absolute sm:-right-4 sm:-bottom-8 sm:hidden lg:-right-16 lg:block lg:w-52"
            />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground lg:mt-12">Telas reais do sistema, com dados fictícios.</p>
        </div>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-24">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance">Se a sua empresa roda no WhatsApp e no caderno, você conhece isto</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {pains.map((pain) => (
              <div key={pain.title} className="lp-reveal flex flex-col gap-2 rounded-xl border border-t-4 border-t-sidebar-primary bg-card p-5 transition-shadow motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1 hover:shadow-md">
                <h3 className="font-medium">{pain.title}</h3>
                <p className="text-sm text-muted-foreground">{pain.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-sidebar text-sidebar-foreground">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">Um serviço, do começo ao fim</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5" aria-label="O caminho de um serviço">
              {journey.map((step, index) => (
                <li key={step.title} className="lp-reveal flex flex-col gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="font-medium">{step.title}</p>
                  <p className="text-sm text-sidebar-foreground/75">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="telas" className="mx-auto flex w-full max-w-6xl scroll-mt-14 flex-col gap-20 px-4 py-16 lg:gap-28 lg:py-24">
          {showcases.map((item, index) => (
            <article key={item.title} className="lp-reveal grid items-center gap-8 lg:grid-cols-5 lg:gap-12">
              <div className={`flex min-w-0 flex-col gap-4 lg:col-span-2 ${index % 2 === 1 ? "lg:order-last" : ""}`}>
                <p className="text-sm font-semibold text-info">{item.eyebrow}</p>
                <h2 className="text-3xl font-semibold tracking-tight text-balance">{item.title}</h2>
                <p className="text-pretty text-muted-foreground">{item.description}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex min-w-0 justify-center lg:col-span-3">
                {item.device === "phone" ? (
                  <PhoneFrame src={item.image} alt={item.alt} sizes="300px" className="w-64 sm:w-72" />
                ) : (
                  <BrowserFrame src={item.image} alt={item.alt} sizes="(max-width: 1024px) 100vw, 680px" />
                )}
              </div>
            </article>
          ))}
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-24">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance">Decida olhando os números da sua empresa</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Um exemplo do que você acompanha no dia a dia. Os valores abaixo são fictícios, não são resultado de clientes.
            </p>
            <div className="mt-10">
              <SampleCharts />
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-14">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-24">
            <h2 className="text-3xl font-semibold tracking-tight">O que o {brand.name} faz</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="lp-reveal flex flex-col gap-3 rounded-xl border bg-card p-5 transition-shadow motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1 hover:shadow-md">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-info/12 text-info dark:bg-info/20">
                    <benefit.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-medium">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="scroll-mt-14 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-24">
            <h2 className="text-3xl font-semibold tracking-tight">Planos</h2>
            <p className="mt-2 text-muted-foreground">Técnico com acesso conta como membro; pessoa da equipe sem acesso, não.</p>
            {plans.length === 0 ? (
              <p className="mt-8 text-sm text-muted-foreground">
                Não foi possível mostrar os planos agora. Fale com {brand.legal.supportEmail}.
              </p>
            ) : (
              <div className="mx-auto mt-10 grid max-w-3xl items-stretch gap-6 md:grid-cols-2">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} savingsCents={savingsCents} signupOpen={signupOpen} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-14">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 lg:py-24">
            <h2 className="text-3xl font-semibold tracking-tight">Dúvidas frequentes</h2>
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

        <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,color-mix(in_oklch,var(--sidebar-primary)_22%,transparent),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Tire sua empresa do caderno</h2>
            <p className="max-w-xl text-pretty text-sidebar-foreground/80">Veja o sistema funcionando e monte o primeiro orçamento da sua empresa.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" className={YELLOW_BUTTON} nativeButton={false} render={signupOpen ? <Link href="/signup" /> : <a href={salesWhatsappHref(`Olá! Quero contratar o ${brand.name}.`)} target="_blank" rel="noreferrer" />}>
                {signupOpen ? "Criar conta" : "Quero contratar"} <ArrowRight className="size-4 motion-safe:transition-transform motion-safe:group-hover/button:translate-x-0.5" aria-hidden />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:bg-transparent"
                nativeButton={false}
                render={<a href="/demo" />}
              >
                Ver demonstração
              </Button>
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
