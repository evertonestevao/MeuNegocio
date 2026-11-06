import { initialsOf } from "@/lib/initials";
import { cn } from "@/lib/utils";

const TONES = [
  "bg-info/15 text-info",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-chart-1/15 text-chart-1",
];

/** Iniciais com cor fixa por nome: ajuda a achar a pessoa ou o cliente na lista pelo olhar. */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return (
    <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", TONES[hash % TONES.length], className)}>
      {initialsOf(name)}
    </span>
  );
}
