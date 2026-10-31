"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { finishMoney, maskCnpj, maskCpfCnpj, maskMoney, maskPhone } from "@/lib/masks";
import { cn } from "@/lib/utils";

const MASKS = { cnpj: maskCnpj, cpfCnpj: maskCpfCnpj, phone: maskPhone, money: maskMoney } as const;

export type InputMask = keyof typeof MASKS;

type MaskedInputProps = Omit<React.ComponentProps<"input">, "value" | "defaultValue"> & {
  mask: InputMask;
  value?: string;
  defaultValue?: string | number;
};

function keepCaret(input: HTMLInputElement, charsBefore: number) {
  let position = 0;
  let seen = 0;
  while (position < input.value.length && seen < charsBefore) {
    if (/[\d,]/.test(input.value[position])) seen += 1;
    position += 1;
  }
  input.setSelectionRange(position, position);
}

/** Campo com máscara brasileira. O server continua validando: a máscara é só ajuda de digitação. */
export function MaskedInput({ mask, value, defaultValue, onChange, onBlur, className, ...props }: MaskedInputProps) {
  const apply = MASKS[mask];
  const isMoney = mask === "money";
  // Valor que já vem do banco chega fechado: 150 aparece como 150,00.
  const initial = (raw: string | number | undefined) => {
    if (raw === undefined) return undefined;
    return isMoney ? finishMoney(String(raw)) : apply(String(raw));
  };

  const input = (
    <Input
      {...props}
      type={mask === "phone" ? "tel" : "text"}
      inputMode={isMoney ? "decimal" : "numeric"}
      autoComplete={props.autoComplete ?? "off"}
      value={value === undefined ? undefined : apply(value)}
      defaultValue={value === undefined ? initial(defaultValue) : undefined}
      className={cn(isMoney && "pl-8", !isMoney && className)}
      onChange={(event) => {
        const target = event.target;
        const caret = target.selectionStart ?? target.value.length;
        const charsBefore = target.value.slice(0, caret).replace(/[^\d,]/g, "").length;
        target.value = apply(target.value);
        if (document.activeElement === target) keepCaret(target, charsBefore);
        onChange?.(event);
      }}
      onBlur={(event) => {
        if (isMoney) {
          const finished = finishMoney(event.target.value);
          if (finished !== event.target.value) {
            event.target.value = finished;
            onChange?.(event as unknown as React.ChangeEvent<HTMLInputElement>);
          }
        }
        onBlur?.(event);
      }}
    />
  );

  if (!isMoney) return input;
  return (
    <span className={cn("relative block w-full", className)}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
        R$
      </span>
      {input}
    </span>
  );
}
