"use client";

import { useEffect, useState } from "react";
import { listVisitConflictsAction } from "@/server/actions/visits";
import type { VisitConflict } from "@/services/visitService";

/** Pede ao servidor quem está ocupado sempre que a data ou o horário mudam. */
export function useVisitConflicts(enabled: boolean, query: { visitId: string | null; visitDate: string; startsAt: string; endsAt: string }) {
  const [conflicts, setConflicts] = useState<VisitConflict[]>([]);
  const { visitId, visitDate, startsAt, endsAt } = query;

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const timer = setTimeout(() => {
      void listVisitConflictsAction({ visitId, visitDate, startsAt, endsAt }).then((result) => {
        if (current) setConflicts(result);
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [enabled, visitId, visitDate, startsAt, endsAt]);

  return enabled ? conflicts : [];
}
