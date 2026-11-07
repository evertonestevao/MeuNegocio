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
import {
  assignColumn,
  IMPORT_FIELD_LABELS,
  IMPORT_TEMPLATE,
  mapHeaders,
  MAX_IMPORT_ROWS,
  previewImport,
  type ColumnMapping,
  type ImportField,
  type ImportPreviewLine,
} from "../import";

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
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [state, dispatch, pending] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await importClientsAction(prev, data);
    if (result.success) {
      toast.success(result.success);
      router.push("/dashboard/clients");
    }
    return result;
  }, undefined);

  // A prévia segue a escolha das colunas: trocar uma refaz a conferência na hora.
  const lines = useMemo<ImportPreviewLine[] | null>(() => (rows ? previewImport(rows, existing, mapping) : null), [rows, existing, mapping]);
  const ready = useMemo(() => (lines ?? []).filter((line) => line.status === "ready"), [lines]);
  const attention = useMemo(() => (lines ?? []).filter((line) => line.status !== "ready"), [lines]);

  async function choose(file: File | undefined) {
    setRows(null);
    setMapping({});
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
    const parsed = parseCsv(decodeSpreadsheet(await file.arrayBuffer()));
    if (parsed.length < 2) {
      setProblem("A planilha está vazia. A primeira linha tem os títulos das colunas e, abaixo dela, um cliente por linha.");
      return;
    }
    if (parsed.length - 1 > MAX_IMPORT_ROWS) setProblem(`A planilha tem mais de ${MAX_IMPORT_ROWS} clientes: só os ${MAX_IMPORT_ROWS} primeiros entram nesta importação.`);
    setMapping(mapHeaders(parsed[0] ?? []));
    setRows(parsed);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Prepare a planilha</CardTitle>
          <CardDescription>
            Uma linha por cliente, com os títulos das colunas na primeira linha. Só o nome é obrigatório; CPF/CNPJ, telefone, e-mail, contato, endereço, número,
            complemento, bairro, cidade, estado, CEP e observações entram se existirem. Antes de importar, você confere o que cada coluna é e pode trocar.
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

      {rows ? (
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
            {rows ? (
              <ColumnMappingEditor
                headers={rows[0] ?? []}
                sample={rows[1] ?? []}
                mapping={mapping}
                onChange={(column, field) => setMapping((current) => assignColumn(current, column, field))}
              />
            ) : null}
            {rows && mapping.name === undefined ? (
              <Alert variant="destructive">
                <AlertDescription>Escolha acima qual coluna tem o nome do cliente. Só o nome é obrigatório.</AlertDescription>
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
                    {line.row?.location ? <span className="block text-xs text-muted-foreground">{line.row.location.address}</span> : null}
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

const FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];

/** O que cada coluna da planilha é. Vem do título; a pessoa troca quando o sistema não reconheceu. */
function ColumnMappingEditor({
  headers,
  sample,
  mapping,
  onChange,
}: {
  headers: string[];
  sample: string[];
  mapping: ColumnMapping;
  onChange: (column: number, field: ImportField | null) => void;
}) {
  const fieldOf = (column: number) => (Object.entries(mapping) as [ImportField, number][]).find(([, index]) => index === column)?.[0] ?? "";
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
      <p className="text-sm font-medium">Colunas da planilha</p>
      <p className="text-xs text-muted-foreground">Confira o que cada coluna é. Se o sistema não reconheceu, escolha aqui; o que ficar em “Não importar” fica de fora.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {headers.map((header, column) => (
          <li key={column} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`column-${column}`} className="text-xs">
              <span className="font-medium">{header.trim() || `Coluna ${column + 1}`}</span>
              {sample[column]?.trim() ? <span className="text-muted-foreground"> · ex.: {sample[column].trim().slice(0, 40)}</span> : null}
            </label>
            <select
              id={`column-${column}`}
              value={fieldOf(column)}
              onChange={(event) => onChange(column, (event.target.value || null) as ImportField | null)}
              className="border-input h-11 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
            >
              <option value="">Não importar</option>
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {IMPORT_FIELD_LABELS[field]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
