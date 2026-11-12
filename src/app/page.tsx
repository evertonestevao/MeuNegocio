import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand, salesWhatsappHref } from "@/config/brand";
import { BrowserFrame, PhoneFrame } from "@/features/marketing/components/device-frames";
import { SampleCharts } from "@/features/marketing/components/sample-charts";
import { SampleServiceResult } from "@/features/marketing/components/sample-service-result";
import { benefits, faq, hero, journey, LANDING_SCREENS, pains, profitPitch, showcases } from "@/features/marketing/content";
import { isSignupOpen } from "@/server/signup";

// O cadastro aberto ou fechado vem do servidor: a página não pode ficar presa ao build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} — ${brand.tagline}` },
  description: hero.description,
};

const YELLOW_BUTTON = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90";

export default async function LandingPage() {
  const contactHref = salesWhatsappHref(`Olá! Quero conhecer o ${brand.name} para a minha empresa.`);
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
            <a href="#contato" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">
              Contato
            </a>
            <a href="#duvidas" className="hidden px-2 text-sm text-muted-foreground hover:text-foreground md:block">
              Dúvidas
            </a>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
              Entrar
            </Button>
            <Button size="sm" nativeButton={false} render={signupOpen ? <Link href="/comecar" /> : <a href={salesWhatsappHref(`Olá! Quero contratar o ${brand.name}.`)} target="_blank" rel="noreferrer" />}>
              {signupOpen ? "Assinar" : "Quero contratar"}
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
              <Button size="lg" className={YELLOW_BUTTON} nativeButton={false} render={signupOpen ? <Link href="/comecar" /> : <a href={contactHref} target="_blank" rel="noreferrer" />}>
                {signupOpen ? "Assinar com período de teste grátis" : "Falar com a gente"} <ArrowRight className="size-4 motion-safe:transition-transform motion-safe:group-hover/button:translate-x-0.5" aria-hidden />
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
              src={`${LANDING_SCREENS}/inicio.jpg`}
              alt="Tela de início com as visitas de hoje, os orçamentos em andamento, o saldo do mês e as contas a pagar."
              sizes="(max-width: 1200px) 100vw, 1100px"
              preload
              className="hidden sm:block"
            />
            <PhoneFrame
              src={`${LANDING_SCREENS}/inicio-celular.jpg`}
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

        <section id="lucro" className="scroll-mt-14 border-y bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
            <div className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-success">{profitPitch.eyebrow}</p>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{profitPitch.title}</h2>
              <p className="text-pretty text-muted-foreground lg:text-lg">{profitPitch.description}</p>
              <ul className="flex flex-col gap-2.5">
                {profitPitch.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className={YELLOW_BUTTON} nativeButton={false} render={<a href="/demo" />}>
                  Ver na demonstração <ArrowRight className="size-4" aria-hidden />
                </Button>
                <Button size="lg" variant="outline" nativeButton={false} render={<a href={contactHref} target="_blank" rel="noreferrer" />}>
                  Falar com a gente
                </Button>
              </div>
            </div>
            <SampleServiceResult />
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

        <section id="contato" className="scroll-mt-14 border-t bg-muted/40">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center lg:py-24">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">Quer usar na sua empresa?</h2>
            <p className="max-w-xl text-pretty text-muted-foreground">
              Fale com a gente pelo WhatsApp. Entendemos como sua equipe trabalha e mostramos a melhor forma de começar.
            </p>
            {/* O botão não se move: animar aqui pode tirá-lo de baixo do clique. */}
            <Button size="lg" className={YELLOW_BUTTON} nativeButton={false} render={<a href={contactHref} target="_blank" rel="noreferrer" />}>
              <MessageCircle className="size-4" aria-hidden /> Falar pelo WhatsApp
            </Button>
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
              <Button size="lg" className={YELLOW_BUTTON} nativeButton={false} render={signupOpen ? <Link href="/comecar" /> : <a href={salesWhatsappHref(`Olá! Quero contratar o ${brand.name}.`)} target="_blank" rel="noreferrer" />}>
                {signupOpen ? "Assinar agora" : "Quero contratar"} <ArrowRight className="size-4 motion-safe:transition-transform motion-safe:group-hover/button:translate-x-0.5" aria-hidden />
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
            <Link href="/denunciar" className="hover:text-foreground">
              Denunciar uso indevido
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
