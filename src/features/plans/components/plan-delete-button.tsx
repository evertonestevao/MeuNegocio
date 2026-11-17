"use client";

import { startTransition, useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deletePlanAction } from "@/server/actions/plans";

/**
 * Excluir plano, com confirmação. Travado quando o plano está em uso ou é do sistema: o motivo vem
 * pronto do servidor (`blockedReason`) e aparece ao passar o mouse; a regra vale de novo no servidor.
 */
export function PlanDeleteButton({
  planId,
  planName,
  planCode,
  blockedReason,
}: {
  planId: string;
  planName: string;
  planCode: string;
  blockedReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [, dispatch, pending] = useActionState(async (_prev: undefined, data: FormData) => {
    const result = await deletePlanAction(undefined, data);
    if (result.error) toast.error(result.error);
    if (result.success) toast.success(result.success);
    // Ao dar certo, a revalidação tira este cartão da tela; fechar evita um diálogo órfão.
    setOpen(false);
    return undefined;
  }, undefined);

  function confirmDelete() {
    const data = new FormData();
    data.set("planId", planId);
    startTransition(() => dispatch(data));
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={blockedReason !== null}
        title={blockedReason ?? undefined}
        onClick={() => setOpen(true)}
        className="text-destructive"
      >
        <Trash2 className="size-4" aria-hidden />
        Excluir
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir o plano {planName}?</DialogTitle>
            <DialogDescription>
              Ninguém usa este plano. Ele sai da lista e o código <strong>{planCode}</strong> fica livre para um plano
              novo. A exclusão não tem volta, mas fica registrada no histórico de alterações.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button variant="destructive" disabled={pending} onClick={confirmDelete}>
              {pending ? "Excluindo..." : "Excluir plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
