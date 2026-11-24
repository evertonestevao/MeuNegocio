// Conexão compartilhada dos scripts de banco. Nunca imprime a URL (ela contém a senha).
import { readFileSync } from "node:fs";
import pg from "pg";

const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|::1|\[::1\])$/;

export function fail(message) {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positional = argv.filter((a) => !a.startsWith("--"));
  return { flags, positional };
}

export async function connect({ remote }) {
  const raw = (process.env.DB ?? "").trim();
  if (!raw) fail("DB vazio: preencha o .env.prod.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("DB não é uma URL válida (confira o formato e se a senha tem caracteres especiais sem codificar).");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) fail("DB precisa começar com postgresql://");

  const host = url.hostname;
  const isLocal = LOCAL_HOST.test(host);
  if (!isLocal && !remote) fail(`host remoto (${host}) exige o flag --remoto.`);

  let ssl = false;
  if (!isLocal) {
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslrootcert");
    const caPath = (process.env.DB_SSL_CA ?? "").trim();
    if (caPath) {
      let ca;
      try {
        ca = readFileSync(caPath.replace(/^~(?=\/)/, process.env.HOME ?? "~"), "utf8");
      } catch {
        fail("não consegui ler o arquivo de DB_SSL_CA.");
      }
      ssl = { rejectUnauthorized: true, ca };
    } else {
      console.warn("AVISO: TLS sem verificação do servidor (preencha DB_SSL_CA para verificar).");
      ssl = { rejectUnauthorized: false };
    }
  }

  console.error(`Conectando em ${host}${isLocal ? " (local)" : " (REMOTO)"}...`);
  const client = new pg.Client({ connectionString: url.toString(), ssl });
  client.on("error", (e) => fail(`conexão: ${e.code ?? ""} ${e.message}`));
  try {
    await client.connect();
  } catch (e) {
    fail(`conexão: ${e.code ?? ""} ${e.message}`);
  }
  return client;
}
