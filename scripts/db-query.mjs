// Consulta somente leitura. Uso: node scripts/db-query.mjs "select ..." [--remoto] [--json]
import { connect, fail, parseArgs } from "./lib/db.mjs";

const { flags, positional } = parseArgs(process.argv.slice(2));
const sql = positional.join(" ").trim();
if (!sql) fail('informe a consulta: "select ..."');

const client = await connect({ remote: flags.has("--remoto") });
try {
  await client.query("set default_transaction_read_only = on");
  await client.query("set statement_timeout = '30s'");
  await client.query("begin read only");
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const r of results) {
    if (flags.has("--json")) console.log(JSON.stringify(r.rows, null, 2));
    else if (r.rows?.length) console.table(r.rows);
    else console.log(`(${r.command ?? "ok"}: ${r.rowCount ?? 0} linhas)`);
  }
  await client.query("rollback");
} catch (e) {
  await client.query("rollback").catch(() => {});
  fail(`${e.code ?? ""} ${e.message}`);
} finally {
  await client.end();
}
