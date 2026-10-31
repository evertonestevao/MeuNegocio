"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Download, MapPin, Phone, Trash2, Users } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VISIT_KIND_LABEL, VISIT_STATUS_LABEL } from "@/features/visits/schemas";
import { formatLongDay } from "@/lib/calendar";
import { formatTimestamp } from "@/lib/dates";
import {
  addWorkOrderPhotoAction,
  completeWorkOrderAction,
  removeWorkOrderPhotoAction,
  saveWorkOrderAction,
  startWorkOrderAction,
} from "@/server/actions/workOrders";
import type { VisitSheet } from "@/types/workOrders";
import { compressPhoto } from "../image";
import { downloadWorkOrderPdf, type WorkOrderPdfInput } from "../pdf";
import { completeWorkOrderSchema, photoCaptionSchema } from "../schemas";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

const TEXTAREA_CLASS =
  "border-input min-h-24 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function VisitSummary({ sheet }: { sheet: VisitSheet }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-start gap-2 font-medium">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {sheet.location.name}
          </span>
          <span className="pl-6 text-muted-foreground">{sheet.location.address}</span>
          {sheet.location.notes ? <span className="pl-6 text-xs text-muted-foreground">{sheet.location.notes}</span> : null}
        </div>
        {sheet.contact ? (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-start gap-2 font-medium">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {[sheet.contact.name, sheet.contact.role].filter(Boolean).join(" · ")}
            </span>
            {sheet.contact.phone ? (
              <a href={phoneHref(sheet.contact.phone)} className="w-fit pl-6 underline">
                {sheet.contact.phone}
              </a>
            ) : null}
          </div>
        ) : null}
        <span className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {sheet.team.join(", ")}
        </span>
        {sheet.notes ? <p className="rounded-lg bg-muted px-3 py-2">{sheet.notes}</p> : null}
      </CardContent>
    </Card>
  );
}

function PhotoGrid({
  sheet,
  urls,
  onRemove,
  pending,
}: {
  sheet: VisitSheet;
  urls: Record<string, string>;
  onRemove?: (photoId: string) => void;
  pending?: boolean;
}) {
  const photos = sheet.work_order?.photos ?? [];
  if (photos.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma foto ainda.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.id} className="flex min-w-0 flex-col gap-1">
          {urls[photo.id] ? (
            <Image
              src={urls[photo.id]}
              alt={photo.caption ?? "Foto do serviço"}
              width={400}
              height={300}
              unoptimized
              className="aspect-[4/3] w-full rounded-lg border object-cover"
            />
          ) : null}
          {photo.caption ? <span className="text-xs break-words text-muted-foreground">{photo.caption}</span> : null}
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              className="self-start"
              aria-label={`Remover foto ${photo.caption ?? ""}`}
              onClick={() => onRemove(photo.id)}
            >
              <Trash2 className="size-4" /> Remover
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function PdfButton({ input }: { input: WorkOrderPdfInput }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await downloadWorkOrderPdf(input);
        } catch {
          toast.error("Não foi possível gerar o PDF. Tente novamente.");
        } finally {
          setPending(false);
        }
      }}
    >
      <Download className="size-4" /> {pending ? "Gerando..." : "Baixar PDF"}
    </Button>
  );
}

function OpenOrderForm({
  sheet,
  photoUrls,
  defaultFinishedTime,
}: {
  sheet: VisitSheet;
  photoUrls: Record<string, string>;
  defaultFinishedTime: string;
}) {
  const order = sheet.work_order;
  const [done, setDone] = useState<string[]>(order?.checklist.filter((item) => item.done).map((item) => item.id) ?? []);
  const [report, setReport] = useState(order?.report ?? "");
  const [startedTime, setStartedTime] = useState(order?.started_time.slice(0, 5) ?? "");
  const [finishedTime, setFinishedTime] = useState(defaultFinishedTime);
  const [signatureName, setSignatureName] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const signature = useRef<SignaturePadHandle>(null);

  function persist(nextDone: string[], nextReport: string, nextStarted: string) {
    startTransition(async () => {
      const result = await saveWorkOrderAction(sheet.id, { doneIds: nextDone, report: nextReport, startedTime: nextStarted });
      setError(result.error ?? null);
    });
  }

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...done, id] : done.filter((value) => value !== id);
    setDone(next);
    persist(next, report, startedTime);
  }

  async function addPhoto(file: File) {
    setError(null);
    const parsedCaption = photoCaptionSchema.safeParse(caption);
    if (!parsedCaption.success) {
      setError(parsedCaption.error.issues[0]?.message ?? "Legenda inválida.");
      return;
    }
    let blob: Blob;
    try {
      blob = await compressPhoto(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível processar a imagem.");
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("visitId", sheet.id);
      data.set("caption", parsedCaption.data);
      data.set("photo", blob, "foto.jpg");
      const result = await addWorkOrderPhotoAction(data);
      if (result.error) setError(result.error);
      else {
        setCaption("");
        toast.success("Foto adicionada");
      }
      if (photoInput.current) photoInput.current.value = "";
    });
  }

  function removePhoto(photoId: string) {
    startTransition(async () => {
      const result = await removeWorkOrderPhotoAction(sheet.id, photoId);
      if (result.error) setError(result.error);
    });
  }

  async function complete() {
    setError(null);
    const parsed = completeWorkOrderSchema.safeParse({ signatureName, startedTime, finishedTime });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    const blob = await signature.current?.toBlob();
    if (!blob) {
      setError("Peça a assinatura do cliente.");
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("visitId", sheet.id);
      data.set("signatureName", signatureName);
      data.set("startedTime", startedTime);
      data.set("finishedTime", finishedTime);
      data.set("report", report);
      for (const id of done) data.append("doneIds", id);
      data.set("signature", blob, "assinatura.png");
      const result = await completeWorkOrderAction(data);
      if (result.error) setError(result.error);
      else toast.success("Ordem de serviço concluída. O registro está assinado.");
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1">
            {order?.checklist.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={done.includes(item.id)}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fotos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Registre o antes e o depois. As fotos vão no PDF da ordem de serviço.</p>
          <PhotoGrid sheet={sheet} urls={photoUrls} onRemove={removePhoto} pending={pending} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="photo-caption">Legenda da próxima foto (opcional)</Label>
            <Input id="photo-caption" value={caption} onChange={(event) => setCaption(event.target.value)} />
          </div>
          <input
            ref={photoInput}
            id="photo-file"
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void addPhoto(file);
            }}
          />
          <Button type="button" variant="outline" disabled={pending} className="self-start" onClick={() => photoInput.current?.click()}>
            <Camera className="size-4" /> {pending ? "Aguarde..." : "Adicionar foto"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relatório</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <Label htmlFor="order-report">O que foi feito</Label>
          <textarea
            id="order-report"
            className={TEXTAREA_CLASS}
            value={report}
            onChange={(event) => setReport(event.target.value)}
            onBlur={() => persist(done, report, startedTime)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Concluir</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="order-start">Início real</Label>
              <Input
                id="order-start"
                type="time"
                value={startedTime}
                onChange={(event) => setStartedTime(event.target.value)}
                onBlur={() => persist(done, report, startedTime)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="order-finish">Fim real</Label>
              <Input id="order-finish" type="time" value={finishedTime} onChange={(event) => setFinishedTime(event.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-signer">Nome de quem assinou</Label>
            <Input id="order-signer" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Assinatura do cliente</span>
            <SignaturePad ref={signature} />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button disabled={pending} onClick={() => void complete()}>
            {pending ? "Aguarde..." : "Concluir ordem de serviço"}
          </Button>
          <p className="text-xs text-muted-foreground">Depois de concluída, a ordem de serviço não pode mais ser alterada.</p>
        </CardContent>
      </Card>
    </>
  );
}

export function WorkOrderSheet({
  sheet,
  company,
  photoUrls,
  signatureUrl,
  canStart,
  planAllows,
  nowTime,
}: {
  sheet: VisitSheet;
  company: WorkOrderPdfInput["company"];
  photoUrls: Record<string, string>;
  signatureUrl: string | null;
  canStart: boolean;
  planAllows: boolean;
  nowTime: string;
}) {
  const order = sheet.work_order;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canFill = sheet.is_mine && order?.status === "in_progress" && sheet.status === "in_progress";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight break-words">{sheet.client_name}</h2>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {formatLongDay(sheet.visit_date)} · {sheet.starts_at.slice(0, 5)}–{sheet.ends_at.slice(0, 5)}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{VISIT_KIND_LABEL[sheet.kind]}</Badge>
          <Badge variant="secondary">{VISIT_STATUS_LABEL[sheet.status]}</Badge>
        </div>
      </div>

      <VisitSummary sheet={sheet} />

      {!order && canStart ? (
        planAllows ? (
          <Card>
            <CardContent className="flex flex-col gap-2">
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                size="lg"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await startWorkOrderAction(sheet.id);
                    setError(result.error ?? null);
                  })
                }
              >
                {pending ? "Aguarde..." : "Cheguei — iniciar serviço"}
              </Button>
              <p className="text-sm text-muted-foreground">O horário de chegada fica registrado e vira o início das horas da equipe.</p>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">A ordem de serviço não está incluída no plano da empresa.</p>
        )
      ) : null}

      {!order && !canStart ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          {sheet.is_mine ? "Esta visita já foi encerrada, sem ordem de serviço." : "A equipe ainda não iniciou a ordem de serviço desta visita."}
        </p>
      ) : null}

      {canFill ? <OpenOrderForm sheet={sheet} photoUrls={photoUrls} defaultFinishedTime={nowTime} /> : null}

      {order && !canFill ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 text-sm">
                {order.checklist.map((item) => (
                  <li key={item.id} className={item.done ? "" : "text-muted-foreground"}>
                    {item.done ? "✓" : "○"} {item.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Fotos</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoGrid sheet={sheet} urls={photoUrls} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Relatório</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="whitespace-pre-wrap">{order.report ?? "Sem relatório."}</p>
              <p className="text-muted-foreground">
                Início {order.started_time.slice(0, 5)}
                {order.finished_time ? ` · Fim ${order.finished_time.slice(0, 5)}` : " · em andamento"}
              </p>
            </CardContent>
          </Card>
          {order.status === "completed" ? (
            <Card>
              <CardHeader>
                <CardTitle>Assinatura do cliente</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {signatureUrl ? (
                  <Image
                    src={signatureUrl}
                    alt={`Assinatura de ${order.signature_name}`}
                    width={400}
                    height={150}
                    unoptimized
                    className="w-full max-w-sm rounded-lg border bg-white"
                  />
                ) : null}
                <p>
                  {order.signature_name} · {formatTimestamp(order.signed_at)}
                </p>
              </CardContent>
            </Card>
          ) : null}
          <div>
            <PdfButton input={{ sheet, company, photoUrls, signatureUrl }} />
          </div>
        </>
      ) : null}
    </div>
  );
}
