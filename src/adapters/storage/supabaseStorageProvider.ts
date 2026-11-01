import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { StorageProvider, StorageUploadParams } from "./StorageProvider";

/**
 * Troca a origem do link do arquivo. Com o Supabase fora do alcance do navegador,
 * os links passam pelo próprio app, que repassa ao Storage (rewrite em next.config.ts).
 */
export function withPublicOrigin(url: string, publicOrigin: string | undefined): string {
  if (!publicOrigin) return url;
  const parsed = new URL(url);
  return `${publicOrigin.replace(/\/$/, "")}${parsed.pathname}${parsed.search}`;
}

/**
 * Implementação Supabase Storage. Recebe o client vinculado à sessão do
 * usuário: as policies do bucket (migration 20260706110000) garantem que
 * cada usuário só escreve na própria pasta — mesmo racional da RLS de dados.
 */
export function createSupabaseStorageProvider(
  client: SupabaseClient,
  bucket: string,
): StorageProvider {
  return {
    name: "supabase",

    async upload({ path, content, contentType, upsert = false }: StorageUploadParams) {
      const { data, error } = await client.storage.from(bucket).upload(path, content, {
        contentType,
        upsert,
      });
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao enviar arquivo", error);
      }
      return { path: data.path };
    },

    async remove(path: string) {
      const { error } = await client.storage.from(bucket).remove([path]);
      if (error) {
        throw new AppError("internal_error", "Falha ao remover arquivo", error);
      }
    },

    getPublicUrl(path: string) {
      return withPublicOrigin(client.storage.from(bucket).getPublicUrl(path).data.publicUrl, process.env.STORAGE_PUBLIC_ORIGIN);
    },

    async createSignedUrl(path: string, expiresInSeconds: number) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data) {
        throw new AppError("internal_error", "Falha ao abrir arquivo", error);
      }
      return withPublicOrigin(data.signedUrl, process.env.STORAGE_PUBLIC_ORIGIN);
    },
  };
}
