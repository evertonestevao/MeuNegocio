"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { compressLogo } from "@/features/company/logo";
import { removeCompanyLogoAction, uploadCompanyLogoAction } from "@/server/actions/companyProfile";

/**
 * Logo dos documentos: envia assim que a pessoa escolhe o arquivo, já reduzido no aparelho. Os botões
 * são type="button": o campo pode ficar dentro de outro formulário (último passo do cadastro).
 */
export function CompanyLogoField({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(undefined);
    startTransition(async () => {
      try {
        const logo = await compressLogo(file);
        const data = new FormData();
        data.set("logo", new File([logo], "logo.png", { type: "image/png" }));
        const result = await uploadCompanyLogoAction(data);
        if (result.error) return setError(result.error);
        setUrl(URL.createObjectURL(logo));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível enviar o logo.");
      }
    });
  }

  function remove() {
    setError(undefined);
    startTransition(async () => {
      const result = await removeCompanyLogoAction();
      if (result.error) return setError(result.error);
      setUrl(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Logo</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {url ? (
            <Image src={url} alt="Logo da empresa" width={128} height={64} unoptimized className="h-full w-full object-contain p-1.5" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Arquivo do logo"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
              {pending ? "Enviando..." : url ? "Trocar logo" : "Enviar logo"}
            </Button>
            {url ? (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remove}>
                Remover
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP. Aparece no orçamento, no link de aprovação, na ordem de serviço e no recibo.</p>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
