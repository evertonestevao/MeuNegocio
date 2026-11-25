"use client";

import { useSyncExternalStore } from "react";

export type ExpenseListMode = "category" | "date";

const STORAGE_KEY = "service-expenses-mode";
const listeners = new Set<() => void>();
let memory: ExpenseListMode | null = null;

function read(): ExpenseListMode {
  if (memory) return memory;
  try {
    return localStorage.getItem(STORAGE_KEY) === "date" ? "date" : "category";
  } catch {
    return "category";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Como a lista de gastos do serviço é mostrada. Lembra a última escolha neste navegador. */
export function useExpenseListMode() {
  // No servidor e na hidratação, sempre o padrão (por categoria); depois, a escolha guardada.
  const mode = useSyncExternalStore(subscribe, read, () => "category" as const);

  function choose(next: ExpenseListMode) {
    memory = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem armazenamento, a escolha vale só enquanto a página estiver aberta.
    }
    listeners.forEach((listener) => listener());
  }

  return { mode, choose };
}
