"use client";

import { startTransition, useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setPlanActiveAction } from "@/server/actions/plans";

export function PlanActiveButton({ planId, isActive }: { planId: string; isActive: boolean }) {
  const [, dispatch, pending] = useActionState(
    async (_prev: undefined, data: FormData) => {
      const result = await setPlanActiveAction(undefined, data);
      if (result.error) toast.error(result.error);
      if (result.success) toast.success(result.success);
      return undefined;
    },
    undefined,
  );

  function toggle() {
    const data = new FormData();
    data.set("planId", planId);
    data.set("isActive", String(!isActive));
    startTransition(() => dispatch(data));
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
      {isActive ? "Desativar" : "Ativar"}
    </Button>
  );
}
