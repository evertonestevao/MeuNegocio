// Aplica migrations versionadas. Uso:
//   node scripts/apply-migration.mjs supabase/migrations/X.sql [...] [--remoto] [--verificar]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { connect, fail, parseArgs } from "./lib/db.mjs";

const { flags, positional } = parseArgs(process.argv.slice(2));
if (!positional.length) fail("informe ao menos um arquivo .sql");

const files = positional.map((path) => {
  const file = basename(path);
  if (!/^\d{14}_.+\.sql$/.test(file)) fail(`nome inválido: ${file} (esperado AAAAMMDDhhmmss_nome.sql)`);
  return { path, version: file.slice(0, 14), name: file.slice(15, -4) };
}).sort((a, b) => a.version.localeCompare(b.version));

const client = await connect({ remote: flags.has("--remoto") });

async function appliedVersions() {
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  return new Set(rows.map((r) => r.version));
}

try {
  if (flags.has("--verificar")) {
    await client.query("begin read only");
    const applied = await appliedVersions();
    let pending = 0;
    for (const f of files) {
      const ok = applied.has(f.version);
      if (!ok) pending++;
      console.log(`${ok ? "aplicada" : "PENDENTE"}  ${f.version}_${f.name}`);
    }
    console.log(`\n${files.length - pending} aplicadas, ${pending} pendentes.`);
    await client.query("rollback");
  } else {
    for (const f of files) {
      const applied = await appliedVersions();
      if (applied.has(f.version)) {
        console.log(`pulada (já aplicada)  ${f.version}_${f.name}`);
        continue;
      }
      const sql = readFileSync(f.path, "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
          [f.version, f.name],
        );
        await client.query("commit");
        console.log(`APLICADA  ${f.version}_${f.name}`);
      } catch (e) {
        await client.query("rollback").catch(() => {});
        fail(`em ${f.version}_${f.name}: ${e.code ?? ""} ${e.message} (rollback feito, parei aqui)`);
      }
    }
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  fail(`${e.code ?? ""} ${e.message}`);
} finally {
  await client.end();
}
