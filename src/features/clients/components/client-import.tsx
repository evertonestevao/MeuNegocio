"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decodeSpreadsheet, parseCsv } from "@/lib/csv";
import { importClientsAction } from "@/server/actions/clients";
import type { ActionState } from "@/server/actions/action-state";
import { IMPORT_TEMPLATE, MAX_IMPORT_ROWS, previewImport, type ImportPreviewLine } from "../import";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const STATUS: Record<ImportPreviewLine["status"], { label: string; tone: string }> = {
  error: { label: "Com erro", tone: "text-destructive" },
  duplicate: { label: "Já cadastrado", tone: "text-warning" },
  ready: { label: "Pronto", tone: "text-success" },
};

/** Planilha modelo, em CSV com ";" e a marca de UTF-8: o Excel em português abre com acento certo. */
function downloadTemplate() {
  const csv = "﻿" + IMPORT_TEMPLATE.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-clientes.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Escolhe a planilha, mostra a prévia linha a linha e importa só o que está pronto. */
export function ClientImport({ existing }: { existing: { name: string; document: string | null }[] }) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [lines, setLines] = useState<ImportPreviewLine[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [state, dispatch, pending] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await importClientsAction(prev, data);
    if (result.success) {
      toast.success(result.success);
      router.push("/dashboard/clients");
    }
    return result;
  }, undefined);

  const ready = useMemo(() => (lines ?? []).filter((line) => line.status === "ready"), [lines]);
  const attention = useMemo(() => (lines ?? []).filter((line) => line.status !== "ready"), [lines]);

  async function choose(file: File | undefined) {
    setLines(null);
    setProblem(null);
    if (!file) return;
    setFileName(file.name);
    if (/\.(xlsx?|ods)$/i.test(file.name)) {
      setProblem("Salve a planilha como CSV e envie de novo. No Excel: Arquivo › Salvar como › CSV UTF-8. No Google Planilhas: Arquivo › Fazer download › CSV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setProblem("O arquivo passa de 2 MB. Divida a planilha em partes menores.");
      return;
    }
    const rows = parseCsv(decodeSpreadsheet(await file.arrayBuffer()));
    const preview = previewImport(rows, existing);
    if (preview.length === 0) {
      setProblem('Não achamos a coluna com o nome do cliente. A primeira linha precisa ter os títulos das colunas, com uma chamada "Nome" (ou "Cliente", "Razão social"). Use o modelo, se preferir.');
      return;
    }
    if (rows.length - 1 > MAX_IMPORT_ROWS) setProblem(`A planilha tem mais de ${MAX_IMPORT_ROWS} clientes: só os ${MAX_IMPORT_ROWS} primeiros entram nesta importação.`);
    setLines(preview);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Prepare a planilha</CardTitle>
          <CardDescription>
            Uma linha por cliente, com os títulos das colunas na primeira linha. Só o nome é obrigatório; CPF/CNPJ, telefone, e-mail, contato, endereço, cidade e
            observações entram se existirem. Colunas com outros nomes são ignoradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="size-4" /> Baixar modelo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Escolha o arquivo</CardTitle>
          <CardDescription>Em CSV, como o Excel e o Google Planilhas salvam. Nada é gravado antes de você conferir.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm hover:bg-muted/50">
            <FileSpreadsheet className="size-6 text-muted-foreground" />
            <span className="font-medium">{fileName ?? "Escolher planilha"}</span>
            <span className="text-xs text-muted-foreground">CSV, até {MAX_IMPORT_ROWS} clientes</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="Planilha de clientes" onChange={(event) => void choose(event.target.files?.[0])} />
          </label>
          {problem ? (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {lines ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Confira e importe</CardTitle>
            <CardDescription>
              {ready.length === 1 ? "1 cliente pronto" : `${ready.length} clientes prontos`}
              {attention.length > 0 ? ` · ${attention.length} ${attention.length === 1 ? "linha fica" : "linhas ficam"} de fora` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            <ul className="flex max-h-[28rem] flex-col divide-y overflow-y-auto text-sm">
              {/* O que precisa de atenção primeiro: é o que a pessoa vai corrigir na planilha. */}
              {[...attention, ...ready].map((line) => (
                <li key={line.line} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="min-w-0 break-words">
                    <span className="text-muted-foreground">Linha {line.line} · </span>
                    {line.name || "Sem nome"}
                    {line.row?.contact?.phone ? <span className="text-muted-foreground"> · {line.row.contact.phone}</span> : null}
                  </span>
                  <span className={`shrink-0 text-xs font-medium ${STATUS[line.status].tone}`}>{line.message ?? STATUS[line.status].label}</span>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData();
                data.set("rows", JSON.stringify(ready.map((line) => line.row)));
                startTransition(() => dispatch(data));
              }}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <Button type="submit" disabled={pending || ready.length === 0}>
                {pending ? "Importando..." : ready.length === 1 ? "Importar 1 cliente" : `Importar ${ready.length} clientes`}
              </Button>
              <span className="text-xs text-muted-foreground">Linhas com erro ou já cadastradas ficam de fora. Corrija na planilha e importe de novo.</span>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
