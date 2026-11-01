import { cn } from "@/lib/utils";

const TONES = [
  "bg-info/15 text-info",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-chart-1/15 text-chart-1",
];

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/** Iniciais com cor fixa por nome: ajuda a achar a pessoa ou o cliente na lista pelo olhar. */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return (
    <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", TONES[hash % TONES.length], className)}>
      {initialsOf(name)}
    </span>
  );
}
