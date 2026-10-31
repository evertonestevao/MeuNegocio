import Image from "next/image";
import { cn } from "@/lib/utils";

type ScreenProps = { src: string; alt: string; sizes: string; preload?: boolean; className?: string };

/** Moldura de navegador para uma tela real do sistema. Só visual. */
export function BrowserFrame({ src, alt, sizes, preload, className }: ScreenProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-2xl", className)}>
      <div className="flex h-8 items-center gap-1.5 border-b bg-muted/60 px-3" aria-hidden>
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
      </div>
      <Image src={src} alt={alt} width={2720} height={1700} sizes={sizes} preload={preload} className="h-auto w-full" />
    </div>
  );
}

/** Moldura de celular para as telas do técnico. Só visual. */
export function PhoneFrame({ src, alt, sizes, className }: ScreenProps) {
  return (
    <div className={cn("overflow-hidden rounded-[2rem] border-[6px] border-[#111827] bg-[#111827] shadow-2xl", className)}>
      <Image src={src} alt={alt} width={780} height={1688} sizes={sizes} className="h-auto w-full rounded-[1.6rem]" />
    </div>
  );
}
