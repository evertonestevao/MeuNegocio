"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";
import { useTenant } from "@/providers/tenant-provider";
import { switchCompanyAction } from "@/server/actions/tenant";

/** Seletor de empresa ativa (header, desktop e mobile). */
export function CompanySwitcher({ canCreate }: { canCreate: boolean }) {
  const { companies, active } = useTenant();
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="max-w-44 gap-2 sm:max-w-56" />
          }
        >
          <Building2 className="size-4 shrink-0" />
          <span className="truncate">{active.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Suas empresas</DropdownMenuLabel>
            {companies.map((company) => (
              <DropdownMenuItem
                key={company.id}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await switchCompanyAction(company.id);
                      if (result?.error) {
                        toast.error(result.error);
                      } else {
                        router.push("/dashboard"); // navegação no client (sem redirect na action)
                      }
                    } catch {
                      toast.error("Não foi possível trocar de empresa. Tente novamente.");
                    }
                  })
                }
              >
                <span className="truncate">{company.name}</span>
                {company.id === active.id ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {canCreate ? (
            <DropdownMenuItem onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Nova empresa
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>Você será o proprietário da nova empresa.</DialogDescription>
          </DialogHeader>
          <CreateCompanyForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
