import { brand, salesWhatsappHref } from "@/config/brand";
import type { DemoProfile } from "@/config/demo";

const CONTACT_HREF = salesWhatsappHref(`Olá! Vi a demonstração e quero contratar o ${brand.name}.`);

/** Faixa fixa da demonstração. Links comuns: entrar, trocar de perfil e sair precisam recarregar no servidor. */
export function DemoBanner({ profile, signupOpen }: { profile: DemoProfile; signupOpen: boolean }) {
  const technician = profile === "technician";
  return (
    <div className="-mx-4 -mt-4 mb-4 flex items-center justify-between gap-x-2 bg-sidebar-primary px-4 py-1.5 text-[11px] sm:gap-x-4 sm:text-sm text-sidebar-primary-foreground lg:-mx-8 lg:-mt-8 lg:mb-8 lg:px-8">
      <p className="font-semibold">Demonstração<span className="hidden font-normal sm:inline">: dados fictícios, nada é salvo.</span></p>
      <div className="flex items-center justify-end gap-x-2 whitespace-nowrap sm:gap-x-4">
        <a href={technician ? "/demo" : "/demo?perfil=tecnico"} className="underline underline-offset-4">
          {technician ? "Ver como escritório" : "Ver como técnico"}
        </a>
        <a href="/demo/sair" className="underline underline-offset-4">
          Sair
        </a>
        <a href={signupOpen ? "/comecar" : CONTACT_HREF} {...(signupOpen ? {} : { target: "_blank", rel: "noreferrer" })} className="rounded-md bg-sidebar px-2 py-1 sm:px-3 font-medium text-sidebar-foreground">
          {signupOpen ? "Criar minha conta" : "Quero contratar"}
        </a>
      </div>
    </div>
  );
}
