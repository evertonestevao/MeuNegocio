import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">O endereço pode ter mudado ou não existir mais.</p>
      <Link href="/" className="underline underline-offset-4">
        Voltar para o início
      </Link>
    </main>
  );
}
