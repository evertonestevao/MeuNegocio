import { brand, salesWhatsappHref } from "@/config/brand";
import type { DemoProfile } from "@/config/demo";

const CONTACT_HREF = salesWhatsappHref(`Olá! Vi a demonstração e quero contratar o ${brand.name}.`);

/** Faixa fixa da demonstração. Links comuns: entrar, trocar de perfil e sair precisam recarregar no servidor. */
export function DemoBanner({ profile, signupOpen }: { profile: DemoProfile; signupOpen: boolean }) {
  const technician = profile === "technician";
  return (
    <div className="-mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-sidebar-primary px-4 py-2 text-sm text-sidebar-primary-foreground lg:-mx-8 lg:-mt-8 lg:mb-8 lg:px-8">
      <p className="font-medium">Você está em uma demonstração, com dados fictícios. Nada é salvo.</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a href={technician ? "/demo" : "/demo?perfil=tecnico"} className="underline underline-offset-4">
          {technician ? "Ver como escritório" : "Ver como técnico"}
        </a>
        <a href="/demo/sair" className="underline underline-offset-4">
          Sair
        </a>
        <a href={signupOpen ? "/signup" : CONTACT_HREF} {...(signupOpen ? {} : { target: "_blank", rel: "noreferrer" })} className="rounded-md bg-sidebar px-3 py-1 font-medium text-sidebar-foreground">
          {signupOpen ? "Criar minha conta" : "Quero contratar"}
        </a>
      </div>
    </div>
  );
}
