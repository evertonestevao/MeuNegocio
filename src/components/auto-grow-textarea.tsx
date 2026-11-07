"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de texto de uma linha que cresce para mostrar tudo o que foi digitado, sem cortar.
 * Enter não quebra linha e quebras coladas viram espaço: o valor continua sendo uma linha só.
 */
export function AutoGrowTextarea({ className, value, onChange, onKeyDown, ...props }: React.ComponentProps<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
        onKeyDown?.(event);
      }}
      onChange={(event) => {
        event.target.value = event.target.value.replace(/\s*[\r\n]+\s*/g, " ");
        onChange?.(event);
      }}
      className={cn(
        "min-h-11 w-full min-w-0 resize-none overflow-hidden rounded-lg border border-input bg-transparent px-2.5 py-2 text-base leading-snug transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:min-h-9 md:py-1.5 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        className,
      )}
      {...props}
    />
  );
}
